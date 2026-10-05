type Row = Record<string, unknown>;

export async function readEventKitRows(readPage: (cursor?: string | number) => Promise<Row[]>) {
  const rows: Row[] = []; let cursor: string | number | undefined;
  for (;;) {
    const page = await readPage(cursor);
    if (!page.length) return rows;
    const next = page[page.length - 1].id;
    if ((typeof next !== "string" && typeof next !== "number") || next === cursor) throw new Error("EventKit pagination did not advance");
    rows.push(...page); cursor = next;
  }
}

export function markMissingEventKitRecords<T extends { entity_type: unknown; eo_id: unknown }>(links: T[], records: Record<string, Row[]>) {
  const ids = new Map(Object.entries(records).map(([kind, rows]) => [kind, new Set(rows.map(row => Number(row.id)))]));
  return links.map(link => ({ ...link, eo_record_missing: !ids.get(String(link.entity_type))?.has(Number(link.eo_id)) }));
}

/** Account links are returned even when this installation has never synced. */
export function projectEventKitLinks(logical: Row[], bindings: Row[], installationId: string) {
  const identities = new Map<string, Set<unknown>>();
  for (const link of logical) if (link.external_identifier) {
    const key = `${link.eventkit_entity_type}:external:${link.external_identifier}`, owners = identities.get(key) ?? new Set();
    owners.add(link.id); identities.set(key, owners);
  }
  for (const binding of bindings) {
    for (const identity of [binding.external_identifier && `external:${binding.external_identifier}`, `local:${binding.calendar_item_identifier}`]) {
      if (!identity) continue;
      const key = `${binding.eventkit_entity_type}:${identity}`;
      const owners = identities.get(key) ?? new Set();
      owners.add(binding.logical_link_id); identities.set(key, owners);
    }
  }
  return logical.map(link => {
    const history = bindings.filter(binding => binding.logical_link_id === link.id);
    const eligible = history.filter(binding => binding.recovery_token === link.recovery_token || (!link.pending_creation && link.mirror_generation == null && binding.recovery_token == null));
    const selected = eligible.find(binding => binding.installation_id === installationId) ?? eligible.sort((a, b) => String(b.last_synced_at).localeCompare(String(a.last_synced_at)) || Number(b.id) - Number(a.id))[0];
    const identityConflict = (link.external_identifier && (identities.get(`${link.eventkit_entity_type}:external:${link.external_identifier}`)?.size ?? 0) > 1) || history.some(binding => [binding.external_identifier && `external:${binding.external_identifier}`, `local:${binding.calendar_item_identifier}`].some(identity => identity && (identities.get(`${binding.eventkit_entity_type}:${identity}`)?.size ?? 0) > 1));
    return { id: selected?.id ?? 0, ...selected, entity_type: link.entity_type, eo_id: link.eo_id, eventkit_entity_type: link.eventkit_entity_type,
      logical_link_id: link.id, recovery_token: link.recovery_token, identity_conflict: Boolean(identityConflict),
      external_identifiers: link.pending_creation ? [] : [...new Set([link.external_identifier, ...eligible.map(binding => binding.external_identifier)].filter(value => typeof value === "string" && value))],
      binding_state: link.pending_creation ? "pending" : selected?.installation_id === installationId ? "current" : "recovery",
      calendar_item_identifier: selected?.calendar_item_identifier ?? "", external_identifier: selected?.external_identifier ?? null,
      calendar_identifier: selected?.calendar_identifier ?? "", source_identifier: selected?.source_identifier ?? "",
      last_synced_snapshot: link.pending_creation ? link.initial_snapshot : selected?.last_synced_snapshot ?? link.initial_snapshot, last_synced_hash: link.pending_creation ? link.initial_hash : selected?.last_synced_hash ?? link.initial_hash,
      bindings: eligible };
  });
}
