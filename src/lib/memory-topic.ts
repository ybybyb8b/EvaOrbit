// A bounded vocabulary bridges common topics across predicates, JSON and prose.
// Keep uncommon terms on the existing lexical path so a synonym is never required.
const vocabulary: { zh: string[]; en: string[]; umbrella?: true }[] = [
  { zh: ["音乐", "听歌", "歌曲", "音乐人", "歌手", "歌单", "唱片"], en: ["music", "song", "songs", "singer", "artist", "artists", "playlist", "album"] },
  { zh: ["电影", "影片", "影视", "看剧", "影剧", "观影"], en: ["film", "films", "movie", "movies", "cinema", "screening"] },
  { zh: ["阅读", "读书", "书籍", "图书", "书单"], en: ["reading", "books", "book", "literature"] },
  { zh: ["字体", "字型", "排版"], en: ["font", "fonts", "typeface", "typography"] },
  { zh: ["穿衣", "穿搭", "服装", "衣服", "衣橱", "着装"], en: ["clothing", "wardrobe", "clothes", "outfit", "outfits", "apparel"] },
  { zh: ["配色", "颜色", "色彩"], en: ["color", "colors", "colour", "colours", "palette"] },
  { zh: ["天气", "气象", "降雨"], en: ["weather", "forecast", "rainfall", "precipitation"] },
  { zh: ["茶饮", "喝茶"], en: ["tea", "teas", "teabag", "oolong"] },
  { zh: ["宠物", "养猫", "养狗", "毛孩子"], en: ["pet", "pets", "kitten", "puppy", "breed"] },
  { zh: ["旅行", "旅游", "出游", "行程"], en: ["travel", "trip", "trips", "vacation", "itinerary"] },
  { zh: ["聊天", "对话", "沟通", "闲聊"], en: ["chat", "conversation", "conversations", "communication", "dialogue"] },
  { zh: ["情绪", "感受", "心情"], en: ["emotion", "emotions", "emotional", "feeling", "feelings", "mood", "hurt"] },
  { zh: ["修复", "和解"], en: ["repair", "reconciliation", "recovery"] },
  { zh: ["推荐", "介绍"], en: ["recommend", "recommended", "recommendation", "recommendations", "introduce", "introduced", "referral"] },
  { zh: ["支持"], en: ["support", "supported", "supportive"] },
  { zh: ["帮助"], en: ["help", "helped", "assistance"] },
  { zh: ["信任"], en: ["trust", "trusted", "trusting"] },
  { zh: ["反对"], en: ["oppose", "opposed", "opposition"] },
  { zh: ["偏好", "喜好", "喜欢", "最爱", "爱好"], en: ["preference", "preferences", "favorite", "favourite", "prefer", "prefers", "like", "likes", "taste", "hobby"], umbrella: true },
  { zh: ["关系", "人际关系"], en: ["relationship", "relationships", "relation", "relations", "friend", "friendship", "family", "bond"], umbrella: true },
  { zh: ["项目", "计划"], en: ["project", "projects", "plan", "plans", "initiative", "roadmap"], umbrella: true },
];

export type MemoryTopic = { term: string; zh: string[]; en: string[] };
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

export function memoryTopics(query: string): MemoryTopic[] {
  const normalized = normalize(query);
  const matched = vocabulary.flatMap(entry => {
    const term = entry.zh.filter(word => normalized.includes(word)).sort((a, b) => b.length - a.length)[0];
    return term ? [{ ...entry, term }] : [];
  });
  const specific = matched.filter(entry => !entry.umbrella);
  return (specific.length ? specific : matched).slice(0, 4);
}

export function memoryTopicSearchTerms(topics: MemoryTopic[]): string[] {
  return [...new Set(topics.flatMap(topic => [topic.term, ...topic.en, ...topic.zh]))].slice(0, 40);
}

export function memoryTopicMatches(values: (string | null)[], topics: MemoryTopic[]): MemoryTopic[] {
  if (!topics.length) return [];
  const text = normalize(values.filter(value => value !== null).join("\n"));
  const words = new Set(text.match(/[a-z]+/g) ?? []);
  return topics.filter(topic => topic.zh.some(word => text.includes(word)) || topic.en.some(word => words.has(word)));
}
