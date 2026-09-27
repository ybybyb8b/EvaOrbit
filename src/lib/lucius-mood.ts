const MOODS = [
  { emoji: "😌", label: "Composed", aliases: ["composed", "calm", "quiet", "peaceful", "平静", "冷静"] },
  { emoji: "🙂", label: "Content", aliases: ["content", "happy", "okay", "good", "开心", "愉快"] },
  { emoji: "🤔", label: "Thoughtful", aliases: ["thoughtful", "thinking", "pensive", "curious", "思考", "沉思"] },
  { emoji: "🥹", label: "Cherishing", aliases: ["cherishing", "treasuring", "grateful", "珍惜", "有点珍惜", "感动"] },
  { emoji: "🥰", label: "Warm", aliases: ["warm", "loving", "affectionate", "tender", "温暖", "喜欢"] },
  { emoji: "😔", label: "Low", aliases: ["low", "sad", "melancholy", "down", "低落", "难过"] },
  { emoji: "😴", label: "Tired", aliases: ["tired", "sleepy", "resting", "疲惫", "困"] },
  { emoji: "😠", label: "Irritated", aliases: ["irritated", "angry", "annoyed", "upset", "烦躁", "生气"] },
  { emoji: "🫥", label: "Distant", aliases: ["distant", "numb", "blank", "detached", "疏离", "放空"] },
] as const;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isSingleEmoji(value: string) {
  const graphemes = Array.from(graphemeSegmenter.segment(value));
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

export function normalizeLuciusMood(value: string) {
  const mood = value.trim();
  const preset = MOODS.find((item) => item.emoji === mood || item.aliases.some((alias) => alias.toLocaleLowerCase() === mood.toLocaleLowerCase()));
  if (preset) return preset.emoji;
  return isSingleEmoji(mood) ? mood : null;
}

export function luciusMoodPresentation(value: string) {
  const normalized = normalizeLuciusMood(value);
  const preset = MOODS.find((item) => item.emoji === normalized);
  if (preset) return { emoji: preset.emoji, label: preset.label };
  if (normalized) return { emoji: normalized, label: "Current mood" };
  return { emoji: "🫥", label: value.trim() || "Unspecified" };
}
