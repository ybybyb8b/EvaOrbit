"""Bounded HTTPS RPC and a durable local outbox. No model calls or chat-history injection."""
import asyncio
import json
import re
import sqlite3
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse


class BridgeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Transport:
    def __init__(self, url, key, token, *, instance=None):
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
            raise ValueError("EO_SUPABASE_URL must be an HTTPS origin")
        self.url = url.rstrip("/") + "/rest/v1/rpc/hermes_bridge"
        self.key, self.token = key, token
        self.instance = instance or str(uuid.uuid4())

    def _request(self, action, data):
        payload = json.dumps({"p_token": self.token, "p_instance": self.instance, "p_action": action, "p_data": data}).encode()
        request = urllib.request.Request(self.url, data=payload, headers={"apikey": self.key, "Content-Type": "application/json"})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
                body = response.read(1048577)
                if len(body) > 1048576:
                    raise BridgeError("Response exceeds channel limit")
                return json.loads(body)
        except urllib.error.HTTPError as error:
            try:
                message = json.loads(error.read(4096)).get("message", "")
            except (ValueError, AttributeError):
                message = ""
            code = re.search(r"\bHERMES_[A-Z_]+\b", message)
            raise BridgeError(code.group() if code else f"Channel HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise BridgeError("Channel connection failed; the local outbox is retained") from None

    async def rpc(self, action, data=None):
        return await asyncio.to_thread(self._request, action, data or {})


class Outbox:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("create table if not exists outbox(seq integer primary key, key text unique, action text, payload text)")

    def put(self, key, action, payload):
        with self.db:
            self.db.execute("insert or ignore into outbox(key,action,payload) values(?,?,?)", (key, action, json.dumps(payload, ensure_ascii=False)))

    async def flush(self, transport):
        discarded = set()
        # Serialized by the adapter lock. A lost HTTP acknowledgement reuses the same key.
        for seq, key, action, payload in self.db.execute("select seq,key,action,payload from outbox order by seq").fetchall():
            try:
                await transport.rpc(action, json.loads(payload))
            except BridgeError as error:
                if str(error) not in {"HERMES_ATTEMPT", "HERMES_NOT_FOUND"}:
                    raise
                discarded.add(key)
                # Explicit retry/clear superseded this attempt. Do not attach its reply elsewhere.
            with self.db:
                self.db.execute("delete from outbox where seq=?", (seq,))
        return discarded

    def contains(self, key):
        return self.db.execute("select 1 from outbox where key=?", (key,)).fetchone() is not None

    def close(self):
        self.db.close()
