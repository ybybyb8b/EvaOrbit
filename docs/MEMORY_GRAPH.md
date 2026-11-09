# Memory Graph v0.2

Memory Graph remains an owner-scoped `Entity → Fact → Source` model. Version 0.2 extends that model without moving persona, policy, or Memo content into the graph.

## Fact lifecycle

- `epistemic_type` records why EvaOrbit believes a Fact: direct statement, recorded observation, derivation, agent judgment, external report, or unknown.
- `supersedes_fact_id` forms a one-way correction chain. Promoting a replacement and invalidating its predecessor happen in one database transaction. A Fact with an active successor cannot be restored.
- All new formal writes use Candidate review with evidence. Direct MCP Fact creation is rejected; the legacy write RPC is private and authenticated direct Fact/Candidate inserts are revoked. Existing data is retained.
- Entity merges still preserve the old Entity as a redirect and retarget its Facts.

## Candidate queue

Automated extraction proposes a complete Fact plus one or more source drafts in `memory_fact_candidates`. A proposal has no effect on recall until explicitly promoted, except for the caller-declared user_confirmed path described below. Promotion creates the Fact and Sources, applies any supersession, and records the review result atomically. Rejection keeps the audit record without changing the graph.

## C1 reads and recall

Memo, Entity, Fact, Source and Candidate use page results with items, has_more and
next_cursor. Continue with the same resource, owner, query, filters and order.
Display order preserves the existing list ordering. Created order uses created_at
and ID for traversal. Inserts, deletes and changes to filter membership between
requests remain visible to a live cursor. Display order can also move after edits.

The legacy Memo array remains available. Online clients can use
GET /api/memos?page=1&q=... and follow the returned cursor. Graph lists use
GET /api/memory-graph?resource=entity|fact|source|candidate, with existing structured
filters, order and cursor. Use status=pending for the review queue. Entity and Fact
detail accept the same resource plus id, and expose factsPage and sourcesPage for
their child lists. A Fact's sources can also continue through resource=source&fact_id=ID.
GET /api/memory-graph?recall=1&q=... returns facts, memos and coverage. The legacy
Graph query still returns Fact hits as an array.

Fact text filters match the predicate, JSON keys and string/boolean/null values
by literal substring, numbers by numeric equality, and object Entity names and
aliases. Source text filters match excerpt, note and source_resource. Both
backends use ASCII-insensitive matching and literal non-ASCII characters.

PostgreSQL uses the read-only forward migration
202611070007_memory_read_pagination.sql. SQLite uses the existing schema.

## C2 Memory Context v1

The internal chat route and the legacy Graph recall adapter call
src/lib/services/memory-context.ts. The service binds the request owner's
Repository and runs src/lib/memory-context.ts, the shared read-only engine.

Input requires query and accepts up to eight query_variants of up to 160
characters each, up to 20 entity_ids, time_mode, as_of, from, to, memo_type,
memo_status, limit (1–20, default 8), and max_chars (default 32000). Entity IDs
scope the Graph results. Memo search stays independent. The database matches
the search terms before paging. Memo includes title, content, tags, type and
status. Fact includes related Entity names/aliases, predicate, JSON keys and
scalars. Source matches include excerpt, note, resource and record ID. Fact
queries collect Source match metadata, then load original Source rows only for
included Facts. Literal matching uses ASCII case folding and preserves Chinese
substrings. Derived words and bigrams supplement the query and variants.

Current mode uses active Facts on the EvaOrbit date. As-of mode uses inclusive
validity at the specified date. A corrected or withdrawn Fact stays historical
even when its recorded validity covers the date. History includes current and
past matches and immediate correction neighbors of the highest-ranked matches.
Two absent validity bounds put an active Fact in unknown_facts. A single
bound remains open at the other end. Explicit ranges use overlapping Fact
validity and Memo event_date. Undated Memo remains unknown in unbounded recall
and is excluded by explicit date filters. Created time never substitutes for an
event date or Fact validity.

The result groups current_facts, historical_facts, unknown_facts, memos,
entities and sources. Records retain raw content, match fields and terms,
relevance, time status and references. Ranking prefers direct name/alias and
strong text matches before importance. Notices flag differing current
assertions, missing dates, corrections and missing sources. The result limit
applies to primary hits. The character budget prioritizes those hits and their
Entity references before optional Source rows. Source coverage records whether
all original evidence was included. A two-second deadline bounds reads and
packing. Coverage distinguishes complete results, budget truncation, timeouts
and query failures. Counts are lower bounds when retrieval was interrupted.

context_text is the budgeted JSON projection of those same record groups.
Only the original no-tools final response sees it. The legacy Graph API keeps
its response contract through an adapter.

PostgreSQL migration 202611070008_memory_context_reads.sql extends the existing
read RPC with term filters, version lookup and evidence-match metadata. It uses
the existing tables, owner scope and RLS.

## C3 MCP recall

The MCP resource `memory_context` is available through `eo_search`. It uses the
same service and the request-bound Repository. Discover its read-only search
contract and on-demand guidance in [MCP.md](../MCP.md#memory-context-c3).

## Remaining Phase C work

- C4 adds an EvaOrbit Memory UI for entering a question, previewing recall, browsing
  Memo, Entity, Fact and Source groups, comparing current and historical items,
  and inspecting aliases, match reasons, evidence, coverage and query status.
  The first version is a read-only recall lab and browser.

## Visualization

`/memo/graph` is an audit-oriented explorer rather than a force-directed canvas:

- a horizontal Entity rail filters the working set;
- each Fact is a stable subject–predicate–object path;
- the inspector exposes epistemic type, confidence, validity, perspective, Source excerpts, and identifiers;
- supersession is shown inline as correction lineage;
- the candidate queue is visibly separate and requires an explicit promote or reject action.

This layout keeps dense graphs readable on iPhone and avoids the uncontrolled context growth and visual clutter of multi-hop node clouds.

## B0 / B1 write contract

See [write governance](MEMORY_WRITE_GOVERNANCE.md) for MCP examples, transaction boundaries,
audit, compatibility and deployment requirements. Apply the PostgreSQL migrations in order, starting with
202611070002_memory_write_governance.sql, then 202611070003_memory_web_review.sql,
202611070004_memory_source_patch.sql, 202611070005_memory_source_unicode.sql and
202611070006_memory_user_confirmed_evidence.sql.
SQLite migration 99 covers the local schema.
Neither a source-code change nor this document implies that production has been migrated.
