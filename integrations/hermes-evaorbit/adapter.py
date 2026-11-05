"""EvaOrbit is a messaging platform. Hermes retains agent/session authority."""
import asyncio
import contextlib
import importlib.util
import logging
import re
import json
import uuid
from datetime import datetime
from pathlib import Path

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
        self.prompts = {}
        self.catalog = []

    async def connect(self, *, is_reconnect=False):
        self.catalog = command_catalog()
        identity = await self.transport.rpc("hello", {"commands": self.catalog})
        if identity["userId"] != self.owner:
            raise BridgeError("Paired account differs from EO_ALLOWED_USERS")
        async with self.lock:
            await self.outbox.flush(self.transport)
        self._mark_connected()
        self.poll_task = asyncio.create_task(self._poll())
        self.heartbeat_task = asyncio.create_task(self._heartbeat())
        return True

    async def disconnect(self):
        self._mark_disconnected()
        for task in (self.poll_task, self.heartbeat_task):
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
        attempt = self._attempt(reply_to)
        # Stable on retries within a turn. Proactive messages are distinct invocations.
        presentation = dict((metadata or {}).get("eo_presentation", {}))
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
        accepted = bool(entry and expected == (message["conversation_id"], entry.session_key)
                        and resolve_gateway_clarify(prompt_id, message["content"]))
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
    ctx.register_platform(name="evaorbit", label="EvaOrbit", adapter_factory=EvaOrbitAdapter,
        check_fn=lambda: all(get_scoped_secret(key) for key in ("EO_SUPABASE_URL", "EO_SUPABASE_KEY", "EO_BRIDGE_TOKEN", "EO_ALLOWED_USERS")),
        validate_config=lambda config: all(_settings(config).values()),
        required_env=["EO_SUPABASE_URL", "EO_SUPABASE_KEY", "EO_BRIDGE_TOKEN", "EO_ALLOWED_USERS"],
        env_enablement_fn=lambda: seed_extra_from_env((("EO_SUPABASE_URL", "url", None), ("EO_SUPABASE_KEY", "key", None), ("EO_BRIDGE_TOKEN", "token", None), ("EO_ALLOWED_USERS", "owner", None)), home_env="EO_HOME_CHAT") if get_scoped_secret("EO_BRIDGE_TOKEN") else None,
        allowed_users_env="EO_ALLOWED_USERS", cron_deliver_env_var="EO_HOME_CHAT", standalone_sender_fn=_standalone_send,
        display_tier="minimal", display_overrides={"show_reasoning": True, "reasoning_style": "code"}, max_message_length=30000, emoji="✦",
        platform_hint="You are receiving messages through EvaOrbit, the user's personal app. It supports Markdown. Use your own session history and tools; the client does not resend history. Reply in the user's language.")
