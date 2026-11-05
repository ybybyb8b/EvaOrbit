"""Use Hermes' own dependencies/source, but an isolated home and no model/network calls."""
import argparse
import asyncio
import importlib.util
import json
import os
import site
import sys
import tempfile
from pathlib import Path


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
    event = MessageEvent(text="Test", message_type=MessageType.TEXT, source=source, message_id=incoming)
    await adapter.on_processing_start(event)
    result = await adapter.send(conversation, "实际回复", reply_to=incoming)
    assert result.success
    await adapter.send(conversation, "实际回复", reply_to=incoming)
    assert fake.calls[-1][1]["id"] == fake.calls[-2][1]["id"], "send retries must reuse the same external ID"
    await adapter.on_processing_complete(event, ProcessingOutcome.SUCCESS)
    assert [action for action, _ in fake.calls] == ["start", "send", "send", "complete"]
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
    from tools.clarify_gateway import register, get_pending, clear_session
    entry = register("test-prompt", "test-session", "Which?", ["A", "B"], multi_select=True)
    card = await adapter.send_clarify(conversation, "Which?", ["A", "B"], "test-prompt", "test-session")
    assert card.success and fake.calls[-1][1]["presentation"]["multi"]
    await adapter._answer_prompt({"id": incoming.split("/")[0], "attempt_id": incoming.split("/")[1], "conversation_id": conversation, "content": '["A","B"]', "presentation": {"kind":"response","promptId":"test-prompt"}})
    assert entry.response == '["A","B"]' and get_pending("test-prompt") is None
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
    print(json.dumps({"realHermesImports": True, "platformRegistered": True, "messageLifecycle": True, "networkOrModelCalls": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--packages", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="eo-hermes-runtime-") as home:
        asyncio.run(verify(Path(args.root), Path(args.packages), Path(home)))
