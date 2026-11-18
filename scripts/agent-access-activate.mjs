import { createHash } from "node:crypto";
import postgres from "postgres";

if (!process.argv.includes("--activate")) throw new Error("Read docs/AGENT_ACCESS.md, then pass --activate for the intended database.");
const secret = process.env.EVAORBIT_AGENT_BRIDGE_KEY;
const database = process.env.DATABASE_URL;
if (!database || !secret || !/^[0-9a-f]{64}$/.test(secret)) {
  throw new Error("DATABASE_URL and a 64-character lowercase hexadecimal EVAORBIT_AGENT_BRIDGE_KEY are required.");
}
const sql = postgres(database, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const digest = createHash("sha256").update(secret).digest("hex");
  await sql`select evaorbit_agent_private.activate(decode(${digest},'hex'))`;
  console.log("Agent Data API boundary installed. Verify through the target HTTPS gateway before switching traffic.");
} finally {
  await sql.end();
}
