import type { DailyJournalEmotion, DailyJournalMood } from "./types";

export const journalEmotions: Array<{ value: DailyJournalEmotion; emoji: string; en: string; zh: string }> = [
  {value:"happy",emoji:"🙂",en:"Happy",zh:"开心"},
  {value:"excited",emoji:"🤩",en:"Excited",zh:"兴奋"},
  {value:"relaxed",emoji:"😌",en:"Relaxed",zh:"放松"},
  {value:"grateful",emoji:"🥰",en:"Grateful",zh:"感激"},
  {value:"neutral",emoji:"😐",en:"Neutral",zh:"平静"},
  {value:"low",emoji:"😞",en:"Low",zh:"低落"},
  {value:"sad",emoji:"😢",en:"Sad",zh:"伤心"},
  {value:"irritated",emoji:"😤",en:"Irritated",zh:"烦躁"},
  {value:"angry",emoji:"😠",en:"Angry",zh:"生气"},
  {value:"anxious",emoji:"😟",en:"Anxious",zh:"焦虑"},
  {value:"lonely",emoji:"🫥",en:"Lonely",zh:"孤独"},
  {value:"surprised",emoji:"😲",en:"Surprised",zh:"惊讶"},
];

const legacyMoods = [
  {value:-2,emoji:"😢",en:"Very low",zh:"很低落"},
  {value:-1,emoji:"🙁",en:"Low",zh:"低落"},
  {value:0,emoji:"😐",en:"Neutral",zh:"平静"},
  {value:1,emoji:"🙂",en:"Good",zh:"不错"},
  {value:2,emoji:"😄",en:"Great",zh:"很好"},
];

export function journalMoodLabel(entry: { emotion?: DailyJournalEmotion | null; moodScore: DailyJournalMood | null }) {
  return journalEmotions.find(option => option.value === entry.emotion) ?? legacyMoods.find(option => option.value === entry.moodScore);
}
