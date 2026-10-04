import type { DailyJournalEntry } from "./types";

export type JournalDraft = Pick<DailyJournalEntry, "content" | "moodScore" | "emotion" | "energyLevel" | "hasFullDiary">;

export function journalPreviewEntries(entries: DailyJournalEntry[]) {
  return entries.slice(0, 3);
}

export function journalDraftChanged(draft: JournalDraft, original?: JournalDraft | null) {
  return draft.content !== (original?.content ?? "")
    || draft.moodScore !== (original?.moodScore ?? null)
    || draft.emotion !== (original?.emotion ?? null)
    || draft.energyLevel !== (original?.energyLevel ?? null)
    || draft.hasFullDiary !== (original?.hasFullDiary ?? false);
}
