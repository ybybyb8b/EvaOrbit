"""Use Hermes' own dependencies/source with an isolated home and a loopback model endpoint."""
import argparse
import asyncio
import importlib.util
import json
import os
import site
import sys
import tempfile
import threading
from types import SimpleNamespace
from datetime import datetime
from http.server import ThreadingHTTPServer
from pathlib import Path


def verify_model_requests(module, source, message_id, home):
    from gateway.run import _build_gateway_agent_history
    from gateway.message_timestamps import coerce_message_timestamp
    from gateway.run_turn_prepare import GatewayTurnPrepareMixin
    from gateway.platforms.event import MessageEvent
    from hermes_state import SessionDB
    from run_agent import AIAgent
    from tests.gateway.fixtures.shared_authority_peer import ModelPeer

    module.install_model_timestamps()
    first_time = datetime.fromisoformat("2026-11-06T14:32:08.123456+08:00")
    second_time = datetime.fromisoformat("2026-11-06T16:02:10+08:00")
    first = "  First message\n    indented line\n"
    second = " [2026-11-05T20:00:00+08:00] is quoted text.  "
    with ThreadingHTTPServer(("127.0.0.1", 0), ModelPeer) as server:
        server.requests, server.metadata_requests = [], []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/v1"
        requests = server.requests

        def turn(text, sent_at, inbound_id, history, platform="evaorbit", session_db=None):
            agent = AIAgent(api_key="test-key", base_url=url, provider="custom", model="test/model",
                            quiet_mode=True, skip_context_files=True, skip_memory=True, platform=platform,
                            skip_background_review=True, enabled_toolsets=[], session_db=session_db)
            agent.api_mode = "chat_completions"
            event = MessageEvent(text=text, source=source, message_id=inbound_id, timestamp=sent_at)
            message, original, epoch = GatewayTurnPrepareMixin()._hmwa_apply_message_timestamp(event, text)
            try:
                result = agent.run_conversation(message, conversation_history=history, persist_user_message=original,
                                                persist_user_timestamp=epoch, persist_user_platform_id=inbound_id,
                                                title_user_message="")
                assert result["final_response"] == "LOCAL_ACK_MESSAGING_WARM", result.get("error")
                return agent.session_id
            finally:
                agent.close()

        try:
            # Inspect the provider-facing HTTP JSON, including reload and retry.
            db_path = home / "timestamp-test.db"
            db = SessionDB(db_path)
            try:
                session_id = turn(first, first_time, message_id, [], session_db=db)
            finally:
                db.close()
            db = SessionDB(db_path)
            try:
                transcript = db.get_messages_as_conversation(session_id, repair_alternation=True)
                raw = next(row for row in db.get_messages(session_id) if row["role"] == "user")
            finally:
                db.close()
            first_wire = next(row["content"] for row in requests[-1]["messages"] if row["role"] == "user")
            assert first_wire == f'<evaorbit-message sent-at="2026-11-06T06:32:08.123456+00:00">\n{first}\n</evaorbit-message>', repr(first_wire)
            saved = next(row for row in transcript if row["role"] == "user")
            assert raw["content"] == first, repr(raw["content"])
            assert coerce_message_timestamp(saved["timestamp"]) == first_time.timestamp(), repr(saved["timestamp"])
            history, _ = _build_gateway_agent_history(transcript)
            for attempt in ("20000000-0000-4000-8000-000000000003", "30000000-0000-4000-8000-000000000003"):
                turn(second, second_time, message_id.split("/")[0] + "/" + attempt, history)
                wire = [row["content"] for row in requests[-1]["messages"] if row["role"] == "user"]
                assert wire == [first_wire, f'<evaorbit-message sent-at="2026-11-06T08:02:10+00:00">\n{second}\n</evaorbit-message>']
            db = SessionDB(db_path)
            try:
                for index in (1, 2):
                    db.append_message(session_id, "user", f"Legacy queued message {index}",
                                      timestamp=first_time.timestamp() + index,
                                      platform_message_id=f"{index}0000000-0000-4000-8000-000000000004/{message_id.split('/')[1]}")
                adjacent = db.get_messages_as_conversation(session_id, repair_alternation=True)
            finally:
                db.close()
            history, _ = _build_gateway_agent_history(adjacent)
            turn(second, second_time, message_id, history)
            wire = "\n".join(row["content"] for row in requests[-1]["messages"] if row["role"] == "user")
            assert wire.count("<evaorbit-message sent-at=") == 4
            for index in (1, 2):
                assert f'sent-at="2026-11-06T06:32:{8 + index:02d}.123456+00:00">\nLegacy queued message {index}' in wire
            turn("Another channel", second_time, message_id, [], platform="telegram")
            assert next(row["content"] for row in requests[-1]["messages"] if row["role"] == "user") == "Another channel"
        finally:
            server.shutdown()
            thread.join(timeout=5)


async def verify(root, packages, home):
    os.environ["HERMES_HOME"] = str(home)
    site.addsitedir(str(packages))
    sys.path.insert(0, str(root))
    from gateway.config import PlatformConfig
    from gateway.platforms.event import MessageEvent, MessageType, ProcessingOutcome
    from gateway.session import build_session_key
    from hermes_cli.plugins import PluginContext, PluginManifest, PluginManager

    spec = importlib.util.spec_from_file_location("test_eo_adapter", Path(__file__).with_name("adapter.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    manifest = PluginManifest(name="evaorbit-platform", kind="platform", path=str(Path(__file__).parent))
    manager = PluginManager()
    module.register(PluginContext(manifest, manager))
    owner = "10000000-0000-4000-8000-000000000099"
    config = PlatformConfig(enabled=True, extra={"url": "https://example.supabase.co", "key": "public", "token": "eo_" + "a" * 43, "owner": owner})
    adapter = module.EvaOrbitAdapter(config)
    catalog = module.command_catalog()
    names = {command["name"] for command in catalog}
    assert {"help", "new", "stop", "status"} <= names and "clear" not in names and "topic" not in names
    class FakeTransport:
        def __init__(self): self.calls = []
        async def rpc(self, action, data=None):
            self.calls.append((action, data))
            return {"userId": owner} if action == "hello" else None
    fake = FakeTransport()
    adapter.transport = fake
    conversation = "10000000-0000-4000-8000-000000000001"
    incoming = "10000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-000000000003"
    source = adapter.build_source(chat_id=conversation, user_id=owner, chat_type="dm")
    other_source = adapter.build_source(chat_id="20000000-0000-4000-8000-000000000001", user_id=owner, chat_type="dm")
    assert build_session_key(source) != build_session_key(other_source), "new EO conversations must have independent Hermes session keys"
    try:
        await asyncio.to_thread(verify_model_requests, module, source, incoming, home)
    except Exception:
        adapter.outbox.close()
        raise
    event = MessageEvent(text="Test", message_type=MessageType.TEXT, source=source, message_id=incoming)
    await adapter.on_processing_start(event)
    from gateway.run_turn_runner import TurnRunner
    runner = TurnRunner.__new__(TurnRunner)
    runner._approval_owner = None
    runner._ctx = SimpleNamespace(source=source, _status_adapter=adapter, inbound_message_id=incoming,
                                  session_key="tool-scope-test", session_id="tool-session", message="test",
                                  title_user_message=None, persist_user_display_kind=None,
                                  persist_user_display_metadata=None, moa_config=None, mute_notification_reply=False,
                                  reply_expected=True, tool_progress_enabled=True)
    runner._native_image_run_message = lambda: "test"
    agent = SimpleNamespace(tool_start_callback=None, _current_api_request_id="request", session_id="tool-session")

    def use_tools(*args, **kwargs):
        assert runner._ctx.tool_progress_enabled is False
        for call_id in ("one", "two"):
            agent.tool_start_callback(call_id, "search", {"secret": "not for EO"})
        activity = adapter.tool_runs[incoming].snapshot()
        assert activity["running"] == 2 and activity["total"] == 2
        for call_id, status in (("one", "ok"), ("two", "error")):
            manager.invoke_hook("post_tool_call", session_id=agent.session_id, api_request_id="request",
                                tool_call_id=call_id, tool_name="search", status=status, result="private tool output")
        return {}

    agent.run_conversation = use_tools
    await asyncio.to_thread(runner._run_conversation_with_approval, agent, [], None, None, None)
    assert agent.tool_start_callback is None and runner._ctx.tool_progress_enabled
    manager.invoke_hook("post_tool_call", session_id=agent.session_id, api_request_id="request",
                        tool_call_id="unrelated", tool_name="other", status="ok")
    activity = adapter.tool_runs[incoming].snapshot()
    assert activity == {"revision": 4, "total": 2, "running": 0, "failed": 1, "tools": [{"name": "search", "count": 2}]}
    result = await adapter.send(conversation, "实际回复", reply_to=incoming)
    assert result.success
    await adapter.send(conversation, "实际回复", reply_to=incoming)
    assert fake.calls[-1][1]["id"] == fake.calls[-2][1]["id"], "send retries must reuse the same external ID"
    await adapter.on_processing_complete(event, ProcessingOutcome.SUCCESS)
    assert [action for action, _ in fake.calls] == ["start", "send", "send", "complete"]
    assert fake.calls[-1][1]["toolActivity"] == {**activity, "revision": 5}
    assert incoming not in adapter.tool_runs
    async def command_handler(event):
        return "Hermes command acknowledged"
    adapter._message_handler = command_handler
    command_event = MessageEvent(text="/status", message_type=MessageType.TEXT, source=source, message_id=incoming)
    await adapter._dispatch_inline_reply(command_event)
    assert [action for action, _ in fake.calls[-3:]] == ["start", "send", "complete"], "busy slash commands need independent delivery receipts"
    await adapter.send(conversation, "💭 **Reasoning:**\n```\nProvided reasoning\n```\n\nAnswer", reply_to=incoming)
    assert fake.calls[-1][1]["presentation"]["reasoning"] == "Provided reasoning"
    assert fake.calls[-1][1]["content"] == "Answer"
    await adapter.send(conversation, "Example:\n```\n<think>literal code</think>\n```", reply_to=incoming)
    assert "presentation" not in fake.calls[-1][1], "ordinary code is never classified as reasoning"
    review = "💾 Self-improvement review: Skill 'hermes-agent' patched"
    await adapter.send(conversation, review, metadata={"_interim_send": True})
    assert fake.calls[-1][1]["presentation"] == {"notice": True}
    assert not adapter.outbox.db.execute("select 1 from notifications where id=?", (fake.calls[-1][1]["id"],)).fetchone()
    await adapter.send_or_update_status(conversation, "notice", "Gateway advisory")
    assert fake.calls[-1][1]["presentation"] == {"notice": True}
    await adapter.send(conversation, review, reply_to=incoming)
    assert "presentation" not in fake.calls[-1][1], "model replies remain conversational"
    from tools.clarify_gateway import register, get_pending, clear_session
    entry = register("test-prompt", "test-session", "Which?", ["A", "B"], multi_select=True)
    card = await adapter.send_clarify(conversation, "Which?", ["A", "B"], "test-prompt", "test-session")
    assert card.success and fake.calls[-1][1]["presentation"]["multi"]
    await adapter._answer_prompt({"id": incoming.split("/")[0], "attempt_id": incoming.split("/")[1], "conversation_id": conversation, "content": '["A","B"]', "created_at": "2026-11-06T15:30:00+08:00", "presentation": {"kind":"response","promptId":"test-prompt"}})
    assert entry.response == '["A","B"]' and get_pending("test-prompt") is None
    from tools.clarify_tool import clarify_tool
    result = json.loads(clarify_tool([{"question": "Which?", "choices": ["A", "B"], "multi_select": True}],
                                     lambda _: {"answers": {"q0": entry.response}, "outcome": "submitted"}))
    response = result["responses"][0]
    assert response["user_response"] == ["A", "B"]
    assert response["user_message_sent_at"] == "2026-11-06T07:30:00+00:00"
    assert response["user_message"] == '["A","B"]'
    assert fake.calls[-1][1]["accepted"] is True
    await adapter._answer_prompt({"id": incoming.split("/")[0], "attempt_id": incoming.split("/")[1], "conversation_id": conversation, "content": "replay", "presentation": {"kind":"response","promptId":"test-prompt"}})
    assert fake.calls[-1][1]["accepted"] is False
    clear_session("test-session")
    adapter.outbox.close()
    installer_spec = importlib.util.spec_from_file_location("eo_installer", Path(__file__).with_name("install.py"))
    installer = importlib.util.module_from_spec(installer_spec)
    installer_spec.loader.exec_module(installer)
    config_file = home / "config.yaml"
    config_file.write_text("# User comment\nmodel:\n  default: existing-model\nplugins:\n  enabled: [existing-plugin]\nplatforms:\n  telegram:\n    enabled: true\n", encoding="utf-8")
    (home / ".env").write_text("# Existing credentials\nTELEGRAM_TOKEN=fake-kept-token\n", encoding="utf-8")
    pairing = home / "pairing.json"
    pairing.write_text(json.dumps({"url": "https://example.supabase.co", "key": "public", "token": "eo_" + "a" * 43, "userId": owner}), encoding="utf-8")
    installer.install(home, pairing)
    from ruamel.yaml import YAML
    installed = YAML(typ="safe").load(config_file.read_text(encoding="utf-8"))
    assert installed["model"]["default"] == "existing-model"
    assert installed["platforms"]["telegram"]["enabled"] is True
    assert installed["plugins"]["enabled"] == ["existing-plugin", "evaorbit-platform"]
    assert "# User comment" in config_file.read_text(encoding="utf-8")
    assert "TELEGRAM_TOKEN=fake-kept-token" in (home / ".env").read_text(encoding="utf-8")
    from hermes_cli.plugins import discover_plugins, get_plugin_manager
    discover_plugins(force=True)
    assert "evaorbit-platform" in get_plugin_manager()._plugins, "installed user plugin must be discoverable through Hermes itself"
    print(json.dumps({"realHermesImports": True, "platformRegistered": True, "messageLifecycle": True,
                      "providerHttpPayloadVerified": True, "externalNetworkOrModelCalls": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--packages", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="eo-hermes-runtime-") as home:
        try:
            asyncio.run(verify(Path(args.root), Path(args.packages), Path(home)))
        finally:
            if "hermes_logging" in sys.modules:
                sys.modules["hermes_logging"]._reset_queued_handlers()
