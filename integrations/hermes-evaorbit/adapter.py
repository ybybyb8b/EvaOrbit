"""EvaOrbit is a messaging platform. Hermes retains agent/session authority."""
import asyncio
import contextlib
import importlib.util
import logging
import re
import json
import uuid
from collections import Counter
from contextvars import ContextVar
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path
from string import Formatter
from threading import Lock

from gateway.config import Platform
from gateway.platforms._shared import extra_or_secret, get_scoped_secret, seed_extra_from_env
from gateway.platforms.base import BasePlatformAdapter, SendResult
from gateway.platforms.event import MessageEvent, MessageType
from gateway.platforms.event import ProcessingOutcome
from hermes_constants import get_hermes_home

# Plugin modules are loaded by path; do not depend on the checkout being a Python package.
_spec = importlib.util.spec_from_file_location("evaorbit_transport", Path(__file__).with_name("transport.py"))
_transport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_transport)
Transport, Outbox, BridgeError = _transport.Transport, _transport.Outbox, _transport.BridgeError
logger = logging.getLogger(__name__)

GATEWAY_NOTICES = (
    "gateway.shutdown.notice_shutdown", "gateway.shutdown.notice_restart", "gateway.shutdown.cron_interrupted",
    "gateway.startup.online", "gateway.startup.restarted", "gateway.startup.db_corrupt",
    "gateway.startup.db_fts_corrupt", "gateway.startup.db_unavailable", "gateway.notify.no_home_channel",
    "gateway.cron_store.unwritable", "gateway.cron_store.recovered",
)


def register_gateway_notice_sources():
    from gateway.run_notifications import GatewayNotificationsMixin
    from gateway.run_notifications_update import GatewayUpdateNotificationsMixin
    from gateway.run_shutdown import GatewayShutdownMixin

    # Keep the scope shared if Hermes reloads the plugin while the gateway stays up.
    scope = getattr(BasePlatformAdapter, "_evaorbit_gateway_notice_source", None)
    if scope is None:
        scope = BasePlatformAdapter._evaorbit_gateway_notice_source = ContextVar("evaorbit_gateway_notice_source", default=False)

    def mark_notice(send):
        @wraps(send)
        async def wrapped(*args, **kwargs):
            token = scope.set(True)
            try:
                return await send(*args, **kwargs)
            finally:
                scope.reset(token)
        wrapped._evaorbit_notice_source = True
        return wrapped

    # These methods only deliver notices. Generic interim sends can contain model commentary.
    for owner, name in (
        (GatewayNotificationsMixin, "_deliver_platform_notice"),
        (GatewayNotificationsMixin, "_send_home_channel_message"),
        (GatewayNotificationsMixin, "_send_restart_notification"),
        (GatewayShutdownMixin, "_send_notice_logged"),
        (GatewayUpdateNotificationsMixin, "_send_update_notification"),
    ):
        descriptor = vars(owner).get(name)
        send = getattr(owner, name, None)
        if descriptor is not None and callable(send) and not getattr(send, "_evaorbit_notice_source", False):
            marked = mark_notice(send)
            setattr(owner, name, staticmethod(marked) if isinstance(descriptor, staticmethod) else marked)


def gateway_notice(content, chat_id, *, advisory):
    from agent.i18n import get_language, t

    for lang in {get_language(), "en"}:
        if content == t("gateway.set_home.success", lang, name="EvaOrbit", chat_id=chat_id):
            return True
        if advisory:
            for key in GATEWAY_NOTICES:
                template = t(key, lang)
                if template == key:
                    continue
                pattern = "".join(re.escape(literal) + (r"[\s\S]+?" if field is not None else "")
                                  for literal, field, _, _ in Formatter().parse(template))
                if re.fullmatch(pattern, content):
                    return True
    return False


class ToolActivity:
    def __init__(self):
        self.lock = Lock()
        self.calls = {}
        self.revision = self.published = 0

    def record(self, request_id, call_id, name, status):
        if not call_id or not name or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
            return
        key = (request_id, call_id)
        with self.lock:
            previous = self.calls.get(key)
            if previous is not None and (status == "running" or previous == (name, status)):
                return
            self.calls[key] = (name, status)
            self.revision += 1

    def snapshot(self, *, final=False):
        with self.lock:
            if not self.revision or not final and self.revision == self.published:
                return None
            names = Counter(name for name, _ in self.calls.values())
            return {
                "revision": self.revision + int(final),
                "total": len(self.calls),
                "running": 0 if final else sum(status == "running" for _, status in self.calls.values()),
                "failed": sum(status in {"error", "blocked", "cancelled"} for _, status in self.calls.values()),
                "tools": [{"name": name, "count": count} for name, count in names.most_common(12)],
            }


def register_tool_activity(ctx):
    from gateway.run_turn_runner import TurnRunner

    run = TurnRunner._run_conversation_with_approval
    current = getattr(run, "_evaorbit_tool_context", None)
    if current is None:
        current = ContextVar("evaorbit_tool_activity", default=None)

        @wraps(run)
        def run_with_activity(runner, agent, *args, **kwargs):
            turn = runner._ctx
            platform = getattr(turn.source.platform, "value", turn.source.platform)
            adapter = turn._status_adapter
            runs = getattr(adapter, "tool_runs", {}) if platform == "evaorbit" else {}
            activity = runs.get(turn.inbound_message_id)
            if activity is None:
                return run(runner, agent, *args, **kwargs)
            token = current.set((agent, activity))
            start = agent.tool_start_callback
            text_progress = turn.tool_progress_enabled

            def started(call_id, name, args):
                activity.record(agent._current_api_request_id, call_id, name, "running")
                if start is not None:
                    start(call_id, name, args)

            agent.tool_start_callback = started
            turn.tool_progress_enabled = False
            try:
                return run(runner, agent, *args, **kwargs)
            finally:
                turn.tool_progress_enabled = text_progress
                agent.tool_start_callback = start
                current.reset(token)

        run_with_activity._evaorbit_tool_context = current
        TurnRunner._run_conversation_with_approval = run_with_activity

    def completed(*, session_id, api_request_id, tool_call_id, tool_name, status, **_):
        bound = current.get()
        if bound is not None:
            agent, activity = bound
            if session_id == agent.session_id:
                activity.record(api_request_id, tool_call_id, tool_name, status)

    ctx.register_hook("post_tool_call", completed)


class EvaOrbitClarifyAnswer(str):
    def __new__(cls, content, sent_at):
        answer = super().__new__(cls, content)
        answer.sent_at = sent_at
        return answer

    def __str__(self):
        # Hermes coerces the submitted answer to str before waking the tool.
        return self


def install_model_timestamps():
    # Hermes persists MessageEvent.timestamp but its built-in labels are global and non-ISO.
    # Keep the label in Hermes' provider-side replay copy, separate from the transcript.
    from agent import agent_runtime_helpers, session_persistence, turn_request_assembly
    from agent.message_metadata import is_compaction_scaffolding
    from agent.turn_context import compose_user_api_content
    from gateway import run
    from gateway.run_turn_prepare import GatewayTurnPrepareMixin
    from gateway.message_timestamps import coerce_message_timestamp
    from tools import clarify_tool

    build = turn_request_assembly.build_api_messages
    if getattr(build, "_evaorbit_timestamps", False):
        return
    prepare = GatewayTurnPrepareMixin._hmwa_apply_message_timestamp
    clarify_result = clarify_tool._result
    durable = session_persistence.durable_user_row_content
    replay = run._build_replay_entry
    merge_users = agent_runtime_helpers._merge_consecutive_users

    def eo_row(row):
        return row.get("role") == "user" and EvaOrbitAdapter._attempt(row.get("platform_message_id") or row.get("message_id"))

    def labeled(body, timestamp):
        if not isinstance(body, str) or not body.strip() or timestamp is None:
            return body
        iso_time = datetime.fromtimestamp(timestamp, UTC).isoformat()
        label = f'<evaorbit-message sent-at="{iso_time}">\n'
        return body if body.startswith(label) and "\n</evaorbit-message>" in body else f"{label}{body}\n</evaorbit-message>"

    @wraps(prepare)
    def prepare_timestamp(runner, event, message_text):
        platform = getattr(event.source, "platform", None)
        if getattr(platform, "value", platform) == "evaorbit" and EvaOrbitAdapter._attempt(event.message_id):
            return message_text, event.text, event.timestamp.timestamp()
        return prepare(runner, event, message_text)

    @wraps(durable)
    def durable_with_timestamp(agent, row, content, api_content):
        original, sidecar = durable(agent, row, content, api_content)
        if getattr(agent, "platform", None) == "evaorbit" and eo_row(row) and not is_compaction_scaffolding(row):
            sidecar = labeled(sidecar or content, coerce_message_timestamp(row.get("timestamp")))
        return original, sidecar

    @wraps(replay)
    def replay_with_timestamp(role, content, row, preserve_timestamp=False):
        entry = replay(role, content, row, preserve_timestamp=preserve_timestamp)
        if eo_row(row) and content == row.get("content") and not is_compaction_scaffolding(row):
            entry["api_content"] = labeled(entry.get("api_content") or content, coerce_message_timestamp(row.get("timestamp")))
        return entry

    @wraps(merge_users)
    def keep_evaorbit_rows_separate(messages):
        # Hermes also merges adjacent users on the wire, after each row has its own label.
        # Keep these boundaries during transcript repair so their original times aren't lost.
        result, repairs, start = [], 0, 0
        for index, row in enumerate(messages):
            sidecar = row.get("api_content")
            if eo_row(row) or (row.get("role") == "user" and isinstance(sidecar, str) and sidecar.startswith("<evaorbit-message sent-at=")):
                merged, count = merge_users(messages[start:index])
                result.extend(merged)
                result.append(row)
                repairs += count
                start = index + 1
        if not start:
            return merge_users(messages)
        merged, count = merge_users(messages[start:])
        return result + merged, repairs + count

    @wraps(build)
    def build_with_timestamps(agent, messages, **kwargs):
        if getattr(agent, "platform", None) != "evaorbit":
            return build(agent, messages, **kwargs)
        request = list(messages)
        for index, row in enumerate(messages):
            if row.get("role") != "user" or row.get("display_kind") or is_compaction_scaffolding(row):
                continue
            body = row.get("content")
            sent_at = coerce_message_timestamp(row.get("timestamp"))
            if not isinstance(body, str) or not body.strip() or sent_at is None:
                continue
            wire_body = row.get("api_content") or body
            if index == kwargs["current_turn_user_idx"] and not row.get("api_content"):
                wire_body = compose_user_api_content(body, kwargs["ext_prefetch_cache"], kwargs["plugin_user_context"]) or body
            request[index] = {**row, "api_content": labeled(wire_body, sent_at)}
        return build(agent, request, **kwargs)

    @wraps(clarify_result)
    def clarify_with_timestamps(normalized, reply, shown=None):
        result = clarify_result(normalized, reply, shown)
        answers = reply.get("answers") or {}
        if not any(isinstance(answer, EvaOrbitClarifyAnswer) for answer in answers.values()):
            return result
        payload = json.loads(result)
        for question, response in zip(normalized, payload["responses"]):
            answer = answers.get(question["qid"])
            if isinstance(answer, EvaOrbitClarifyAnswer):
                response["user_message_sent_at"] = answer.sent_at
                if response["user_response"] != answer:
                    response["user_message"] = str.__str__(answer)
        return json.dumps(payload, ensure_ascii=False)

    build_with_timestamps._evaorbit_timestamps = True
    GatewayTurnPrepareMixin._hmwa_apply_message_timestamp = prepare_timestamp
    turn_request_assembly.build_api_messages = build_with_timestamps
    session_persistence.durable_user_row_content = durable_with_timestamp
    run._build_replay_entry = replay_with_timestamp
    agent_runtime_helpers._SEQUENCE_REPAIR_PASSES = tuple(
        keep_evaorbit_rows_separate if step is merge_users else step
        for step in agent_runtime_helpers._SEQUENCE_REPAIR_PASSES
    )
    clarify_tool._result = clarify_with_timestamps


def command_catalog():
    from hermes_cli.commands import COMMAND_REGISTRY, _is_gateway_available, _resolve_config_gates, _iter_plugin_command_entries
    gates = _resolve_config_gates()
    # Telegram topic/start commands are transport-specific, not EO capabilities.
    rows = [{"name": item.name, "description": item.description[:250], "localizedDescription": item.describe()[:250],
             "argsHint": item.args_hint[:160], "aliases": list(item.aliases)[:10]}
            for item in COMMAND_REGISTRY if _is_gateway_available(item, gates) and item.name not in {"start", "topic"}]
    rows.extend({"name": name, "description": description[:250], "localizedDescription": description[:250], "argsHint": args[:160], "aliases": []}
                for name, description, args in _iter_plugin_command_entries())
    return [row for row in rows if re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", row["name"])][:100]


def _settings(config):
    extra = getattr(config, "extra", {}) or {}
    return {name: extra_or_secret(extra, name, env) for name, env in (
        ("url", "EO_SUPABASE_URL"), ("key", "EO_SUPABASE_KEY"), ("token", "EO_BRIDGE_TOKEN"), ("owner", "EO_ALLOWED_USERS"))}


class EvaOrbitAdapter(BasePlatformAdapter):
    def __init__(self, config):
        super().__init__(config, Platform("evaorbit"))
        values = _settings(config)
        self.transport = Transport(values["url"], values["key"], values["token"])
        self.owner = values["owner"]
        self.outbox = Outbox(get_hermes_home() / "cache" / "evaorbit-outbox.db")
        self.lock = asyncio.Lock()
        self.poll_task = self.heartbeat_task = None
        self.tool_progress_task = None
        self.tool_runs = {}
        self.prompts = {}
        self.catalog = []

    async def connect(self, *, is_reconnect=False):
        install_model_timestamps()
        self.catalog = command_catalog()
        identity = await self.transport.rpc("hello", {"commands": self.catalog})
        if identity["userId"] != self.owner:
            raise BridgeError("Paired account differs from EO_ALLOWED_USERS")
        async with self.lock:
            await self.outbox.flush(self.transport)
        self._mark_connected()
        self.poll_task = asyncio.create_task(self._poll())
        self.heartbeat_task = asyncio.create_task(self._heartbeat())
        self.tool_progress_task = asyncio.create_task(self._publish_tool_activity())
        return True

    async def disconnect(self):
        self._mark_disconnected()
        for task in (self.poll_task, self.heartbeat_task, self.tool_progress_task):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        with contextlib.suppress(BridgeError):
            await self.transport.rpc("bye")
        # Keep the outbox open: an in-flight reply during gateway drain must still be saved locally.

    async def _heartbeat(self):
        while True:
            await asyncio.sleep(25)
            try:
                catalog = command_catalog()
                await self.transport.rpc("heartbeat", {"commands": catalog} if catalog != self.catalog else {})
                self.catalog = catalog
                from tools.clarify_gateway import get_pending
                for prompt_id in list(self.prompts):
                    if get_pending(prompt_id) is None:
                        await self.transport.rpc("retire", {"promptId": prompt_id})
                        self.prompts.pop(prompt_id, None)
                async with self.lock:
                    await self.outbox.flush(self.transport)
                    await self.outbox.flush_notifications(self.transport)
            except BridgeError as error:
                logger.warning("EvaOrbit heartbeat: %s", error)

    async def _poll(self):
        while True:
            try:
                if not self._message_handler:
                    await asyncio.sleep(1)
                    continue
                async with self.lock:
                    await self.outbox.flush(self.transport)
                    await self.outbox.flush_notifications(self.transport)
                message = await self.transport.rpc("claim")
                if message:
                    if message["user_id"] != self.owner:
                        raise BridgeError("Inbound account mismatch")
                    if message.get("presentation", {}).get("kind") == "response":
                        await self._answer_prompt(message)
                        continue
                    source = self.build_source(chat_id=message["conversation_id"], chat_name="EvaOrbit", chat_type="dm", user_id=self.owner, user_name="EvaOrbit")
                    event = MessageEvent(text=message["content"], message_type=MessageType.TEXT, source=source,
                        message_id=f'{message["id"]}/{message["attempt_id"]}', allow_gateway_control=message.get("presentation", {}).get("kind") != "note",
                        timestamp=datetime.fromisoformat(message["created_at"].replace("Z", "+00:00")))
                    await self.handle_message(event)
                await asyncio.sleep(3 if message else 5)
            except BridgeError as error:
                logger.warning("EvaOrbit receive: %s", error)
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("EvaOrbit receive failed")
                await asyncio.sleep(10)

    async def _publish_tool_activity(self):
        while True:
            await asyncio.sleep(4)
            for message_id, activity in list(self.tool_runs.items()):
                snapshot = activity.snapshot()
                if snapshot is None:
                    continue
                try:
                    await self.transport.rpc("tools", {**self._attempt(message_id), "toolActivity": snapshot})
                except BridgeError as error:
                    if str(error) != "HERMES_ATTEMPT":
                        logger.debug("EvaOrbit tool activity: %s", error)
                    continue
                activity.published = snapshot["revision"]

    @staticmethod
    def _attempt(message_id):
        try:
            message, attempt = message_id.split("/", 1)
            return {"id": str(uuid.UUID(message)), "attemptId": str(uuid.UUID(attempt))}
        except (ValueError, AttributeError):
            return None

    async def on_processing_start(self, event):
        attempt = self._attempt(event.message_id)
        if attempt:
            await self.transport.rpc("start", attempt)
            self.tool_runs[event.message_id] = ToolActivity()

    async def _dispatch_inline_reply(self, event, **kwargs):
        # Hermes' busy-command path deliberately skips normal session lifecycle hooks.
        # Record its own receipt without ending or impersonating the original agent turn.
        await self.on_processing_start(event)
        try:
            await super()._dispatch_inline_reply(event, **kwargs)
        except Exception:
            await self.on_processing_complete(event, ProcessingOutcome.FAILURE)
            raise
        else:
            await self.on_processing_complete(event, ProcessingOutcome.SUCCESS)

    async def on_processing_complete(self, event, outcome):
        attempt = self._attempt(event.message_id)
        if not attempt:
            return
        payload = {**attempt, "outcome": outcome.value}
        activity = self.tool_runs.pop(event.message_id, None)
        snapshot = activity.snapshot(final=True) if activity else None
        if snapshot:
            payload["toolActivity"] = snapshot
        key = f'complete:{event.message_id}'
        async with self.lock:
            self.outbox.put(key, "complete", payload)
            await self.outbox.flush(self.transport)

    async def send(self, chat_id, content, reply_to=None, metadata=None):
        if not content.strip():
            return SendResult(success=False, error="Empty message")
        try:
            chat_id = str(uuid.UUID(chat_id))
        except ValueError:
            return SendResult(success=False, error="Use an EvaOrbit conversation UUID")
        metadata = metadata or {}
        attempt = self._attempt(reply_to)
        # Stable on retries within a turn. Proactive messages are distinct invocations.
        presentation = dict(metadata.get("eo_presentation", {}))
        interim = metadata.get("_interim_send")
        notice_source = getattr(self, "_evaorbit_gateway_notice_source", None)
        if not presentation and (metadata.get("eo_notice") or (notice_source is not None and notice_source.get())
                                 or (interim and content.startswith("💾 "))
                                 or gateway_notice(content, chat_id, advisory=not attempt or interim)):
            presentation["notice"] = True
            if interim or metadata.get("eo_notice"):
                attempt = None
        # Only Hermes' own localized reasoning envelope, anchored at the message start.
        # Never interpret think tags or code fences in ordinary answers as internal reasoning.
        match = re.match(r'^💭 \*\*(?:Reasoning:|推理：)\*\*\n```\n([\s\S]*?)\n```\n\n([\s\S]+)$', content)
        if match:
            presentation["reasoning"], content = match.group(1), match.group(2)
        fingerprint = f'{chat_id}:{reply_to}:{content}:{json.dumps(presentation, sort_keys=True)}' if attempt else str(uuid.uuid4())
        message_id = str(uuid.uuid5(uuid.NAMESPACE_URL, fingerprint))
        payload = {"id": message_id, "conversationId": chat_id, "content": content}
        if presentation:
            payload["presentation"] = presentation
        if attempt:
            payload.update(replyTo=attempt["id"], attemptId=attempt["attemptId"])
        async with self.lock:
            self.outbox.put(message_id, "send", payload)
            try:
                discarded = await self.outbox.flush(self.transport)
            except BridgeError as error:
                return SendResult(success=False, error=str(error), retryable=False)
        if message_id in discarded:
            return SendResult(success=False, error="Conversation cleared or attempt superseded", retryable=False)
        return SendResult(success=True, message_id=message_id)

    async def send_or_update_status(self, chat_id, status_key, content, metadata=None):
        return await self.send(chat_id, content, metadata={**(metadata or {}), "eo_notice": True})

    async def send_clarify(self, chat_id, question, choices, clarify_id, session_key, metadata=None):
        from tools.clarify_gateway import get_pending, mark_awaiting_text
        entry = get_pending(clarify_id)
        if entry is None or entry.session_key != session_key:
            return SendResult(success=False, error="Question expired", retryable=False)
        mark_awaiting_text(clarify_id)
        self.prompts[clarify_id] = (chat_id, session_key)
        presentation = {"kind": "choices", "promptId": clarify_id, "options": list(choices or []), "multi": entry.multi_select, "state": "pending"}
        result = await self.send(chat_id, question, metadata={**(metadata or {}), "eo_presentation": presentation})
        if not result.success:
            self.prompts.pop(clarify_id, None)
        return result

    async def _answer_prompt(self, message):
        from tools.clarify_gateway import get_pending, resolve_gateway_clarify
        prompt_id = message["presentation"].get("promptId")
        entry = get_pending(prompt_id)
        expected = self.prompts.get(prompt_id)
        accepted = False
        if entry and expected == (message["conversation_id"], entry.session_key):
            sent_at = datetime.fromisoformat(message["created_at"].replace("Z", "+00:00")).astimezone(UTC).isoformat()
            accepted = resolve_gateway_clarify(prompt_id, EvaOrbitClarifyAnswer(message["content"], sent_at))
        payload = {"id": message["id"], "attemptId": message["attempt_id"], "accepted": accepted}
        async with self.lock:
            self.outbox.put(f'responded:{message["id"]}', "responded", payload)
            await self.outbox.flush(self.transport)
        self.prompts.pop(prompt_id, None)

    async def send_typing(self, chat_id, metadata=None):
        # Processing is represented by durable per-message state, not per-token writes.
        pass

    async def get_chat_info(self, chat_id):
        return {"name": "EvaOrbit", "type": "dm"}


async def _standalone_send(pconfig, chat_id, message, *, thread_id=None, media_files=None, force_document=False):
    if media_files:
        return {"error": "EvaOrbit currently supports text messages only"}
    values = _settings(pconfig)
    transport = Transport(values["url"], values["key"], values["token"])
    key = str(uuid.uuid4())
    payload = {"id": key, "conversationId": str(uuid.UUID(chat_id)), "content": message}
    outbox = Outbox(get_hermes_home() / "cache" / "evaorbit-proactive-outbox.db")
    try:
        outbox.put(key, "deliver", payload)
        discarded = await outbox.flush(transport)
        await outbox.flush_notifications(transport)
        return {"error": "Conversation cleared"} if key in discarded else {"success": True, "message_id": key}
    except BridgeError as error:
        return {"error": str(error)}
    finally:
        outbox.close()


def register(ctx):
    register_gateway_notice_sources()
    register_tool_activity(ctx)
    ctx.register_platform(name="evaorbit", label="EvaOrbit", adapter_factory=EvaOrbitAdapter,
        check_fn=lambda: all(get_scoped_secret(key) for key in ("EO_SUPABASE_URL", "EO_SUPABASE_KEY", "EO_BRIDGE_TOKEN", "EO_ALLOWED_USERS")),
        validate_config=lambda config: all(_settings(config).values()),
        required_env=["EO_SUPABASE_URL", "EO_SUPABASE_KEY", "EO_BRIDGE_TOKEN", "EO_ALLOWED_USERS"],
        env_enablement_fn=lambda: seed_extra_from_env((("EO_SUPABASE_URL", "url", None), ("EO_SUPABASE_KEY", "key", None), ("EO_BRIDGE_TOKEN", "token", None), ("EO_ALLOWED_USERS", "owner", None)), home_env="EO_HOME_CHAT") if get_scoped_secret("EO_BRIDGE_TOKEN") else None,
        allowed_users_env="EO_ALLOWED_USERS", cron_deliver_env_var="EO_HOME_CHAT", standalone_sender_fn=_standalone_send,
        display_tier="minimal", display_overrides={"show_reasoning": True, "reasoning_style": "code"}, max_message_length=30000, emoji="✦",
        platform_hint="You are receiving messages through EvaOrbit, the user's personal app. It supports Markdown. Use your own session history and tools; the client does not resend history. An EvaOrbit message's sent-at attribute records its original send time. Reply in the user's language.")
