# MCP boundary

The remote MCP endpoint is authenticated and runs all operations inside the
request's per-user repository context. Dedicated tools remain backward
compatible. Generic tools route only through the server-side Resource Registry;
they never accept table names or expose arbitrary database CRUD.

Each registered resource declares capabilities and a public schema, validates
create/update payloads strictly, preserves PATCH semantics, and delegates
deletes and non-CRUD actions to existing business services. Register resources
one at a time rather than mirroring every database table.

Memory Graph v0.1 registers three resources without changing the generic MCP
tool protocol:

- `memory_entity`: canonical-name and alias search, get/create/update, archive,
  restore, and atomic merge. Merged entities remain readable redirects.
- `memory_fact`: direct `in`/`out`/`both` entity queries with predicate,
  perspective, status, and `valid_on` filters; get/create and metadata-only
  update; invalidate and restore. Subject, predicate, object, and perspective
  cannot be rewritten by update.
- `memory_source`: forward lookup by Fact and reverse lookup by resource plus an
  opaque string record ID, with create/get/update/delete for provenance links.

`perspective_entity_id` attributes an assertion's viewpoint; it is not access
control or a claim about what an Identity knows. `valid_to` ends real-world
validity, while `invalidated` records graph correction or withdrawal. Entity
and Fact delete are intentionally unavailable.
