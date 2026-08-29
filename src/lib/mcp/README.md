# MCP boundary

The remote MCP endpoint is authenticated and runs all operations inside the
request's per-user repository context. Dedicated tools remain backward
compatible. Generic tools route only through the server-side Resource Registry;
they never accept table names or expose arbitrary database CRUD.

Each registered resource declares capabilities and a public schema, validates
create/update payloads strictly, preserves PATCH semantics, and delegates
deletes and non-CRUD actions to existing business services. Register resources
one at a time rather than mirroring every database table.
