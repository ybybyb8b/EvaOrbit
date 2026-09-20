# Memory Graph v0.2

Memory Graph remains an owner-scoped `Entity → Fact → Source` model. Version 0.2 extends that model without moving persona, policy, or Memo content into the graph.

## Fact lifecycle

- `epistemic_type` records why EvaOrbit believes a Fact: direct statement, recorded observation, derivation, agent judgment, external report, or unknown.
- `supersedes_fact_id` forms a one-way correction chain. Promoting a replacement and invalidating its predecessor happen in one database transaction. A Fact with an active successor cannot be restored.
- Formal v0.2 writes require at least one Source and create the Fact and Sources atomically. The original direct-create path remains for the trusted v0.1 MCP contract and existing data.
- Entity merges still preserve the old Entity as a redirect and retarget its Facts.

## Candidate queue

Automated extraction proposes a complete Fact plus one or more source drafts in `memory_fact_candidates`. A proposal has no effect on recall until a person promotes it. Promotion creates the Fact and Sources, applies any supersession, and records the review result atomically. Rejection keeps the audit record without changing the graph.

## Recall

Recall combines four bounded signals and ranks them together:

1. exact Entity or alias match;
2. literal substring match across the Fact, related Entities, and Source excerpts;
3. lexical matching using Latin terms and Chinese bigrams;
4. a one-hop expansion through subject, object, or perspective Entities.

Only active Facts valid on the current EvaOrbit date are eligible. Importance and confidence break close scores. The initial implementation scans at most 200 Facts in process, avoiding another search dependency while the graph is small. Backend FTS and embedding/vector recall should be added only after the corpus or recall evaluations show that this bound is no longer sufficient. Two-hop expansion remains intentionally excluded.

The top recalled Facts are supplied to chat as untrusted, sourced context. A recall failure never prevents chat from responding.

## Visualization

`/memo/graph` is an audit-oriented explorer rather than a force-directed canvas:

- a horizontal Entity rail filters the working set;
- each Fact is a stable subject–predicate–object path;
- the inspector exposes epistemic type, confidence, validity, perspective, Source excerpts, and identifiers;
- supersession is shown inline as correction lineage;
- the candidate queue is visibly separate and requires an explicit promote or reject action.

This layout keeps dense graphs readable on iPhone and avoids the uncontrolled context growth and visual clutter of multi-hop node clouds.
