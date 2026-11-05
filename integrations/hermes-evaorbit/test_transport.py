import asyncio
import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("eo_transport", Path(__file__).with_name("transport.py"))
transport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(transport)


class OutboxTest(unittest.IsolatedAsyncioTestCase):
    async def test_network_failure_keeps_reply_and_replays_same_message_id_after_restart(self):
        class Fake:
            def __init__(self):
                self.ids = []
                self.offline = True

            async def rpc(self, action, data):
                self.ids.append(data["id"])
                if self.offline:
                    raise transport.BridgeError("offline")

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "outbox.db"
            outbox = transport.Outbox(path)
            payload = {"id": "stable-id", "content": "实际回复"}
            outbox.put("stable-id", "send", payload)
            outbox.put("stable-id", "send", payload)
            fake = Fake()
            with self.assertRaises(transport.BridgeError):
                await outbox.flush(fake)
            outbox.close()
            outbox = transport.Outbox(path)
            self.assertTrue(outbox.contains("stable-id"))
            fake.offline = False
            await outbox.flush(fake)
            self.assertFalse(outbox.contains("stable-id"))
            self.assertEqual(fake.ids, ["stable-id", "stable-id"])
            outbox.close()

    async def test_superseded_reply_does_not_block_new_replies_or_report_delivery_success(self):
        class Fake:
            async def rpc(self, action, data):
                if data["id"] == "old":
                    raise transport.BridgeError("HERMES_ATTEMPT")
        with tempfile.TemporaryDirectory() as directory:
            outbox = transport.Outbox(Path(directory) / "outbox.db")
            outbox.put("old", "send", {"id": "old"})
            outbox.put("new", "send", {"id": "new"})
            self.assertEqual(await outbox.flush(Fake()), {"old"})
            self.assertFalse(outbox.contains("new"))
            outbox.close()

    def test_transport_requires_tls(self):
        with self.assertRaises(ValueError):
            transport.Transport("http://untrusted.invalid", "public-key", "secret")


if __name__ == "__main__":
    unittest.main()
