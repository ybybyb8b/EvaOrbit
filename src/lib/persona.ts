import fs from "node:fs";
import path from "node:path";
import type { Memory, Task } from "./types";

const fallbackPersona = `我是本人的 Self Persona，是留在 EvaOrbit 里的另一个自己。
我替自己记东西、翻以前的信息、整理现状，必要时才行动。
说话自然、简洁、有判断，不扮演客服、教练、秘书或管家。
旧 Memory 可能已经变化；遇到冲突优先关注较新的信息，不擅自固定本人。`;

let cachedPersona: string | null = null;

export function readSelfPersona() {
  if (cachedPersona !== null) return cachedPersona;
  try {
    cachedPersona = fs.readFileSync(path.join(process.cwd(), "SELF_PERSONA.md"), "utf8").trim();
  } catch {
    cachedPersona = fallbackPersona;
  }
  return cachedPersona;
}

const genericTerms = new Set([
  "一个", "一下", "一些", "什么", "怎么", "可以", "帮我", "看看", "这个", "那个", "最近", "现在", "今天",
  "我的", "你的", "有没有", "东西", "事情", "一下子", "please", "about", "with", "that", "this",
]);

export function queryTerms(query: string) {
  const normalized = query.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const terms = new Set<string>();
  for (const word of normalized.match(/[a-z0-9][a-z0-9_-]{1,}|[\u3400-\u9fff]{2,}/g) ?? []) {
    if (!genericTerms.has(word)) terms.add(word);
    if (/^[\u3400-\u9fff]+$/.test(word)) {
      for (let size = 2; size <= Math.min(4, word.length); size += 1) {
        for (let index = 0; index <= word.length - size; index += 1) {
          const part = word.slice(index, index + size);
          if (!genericTerms.has(part)) terms.add(part);
        }
      }
    }
  }
  return [...terms].slice(0, 40);
}

function scoreText(text: string, query: string, terms: string[]) {
  const normalized = text.toLocaleLowerCase();
  let score = query.length >= 2 && normalized.includes(query.toLocaleLowerCase()) ? 12 : 0;
  for (const term of terms) if (normalized.includes(term)) score += Math.min(term.length, 5);
  return score;
}

export function selectRelevantMemories(memories: Memory[], query: string, limit = 6) {
  const terms = queryTerms(query);
  const ranked = memories
    .map((memory, index) => ({ memory, index, score: scoreText(`${memory.category} ${memory.title} ${memory.content}`, query, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.memory);
  const recallIntent = /记得|记过|记忆|以前|之前|过去|最近|忘了|漏了|memory|remember/i.test(query);
  return ranked.length || !recallIntent ? ranked : memories.slice(0, Math.min(limit, 4));
}

export function selectRelevantTasks(tasks: Task[], query: string, limit = 10) {
  const taskIntent = /任务|待办|截止|到期|今天|安排|计划|忘了|漏了|先做|先弄|task|todo|deadline/i.test(query);
  if (!taskIntent) return [];
  const terms = queryTerms(query);
  return tasks
    .map((task, index) => ({ task, index, score: scoreText(`${task.title} ${task.notes} ${task.tags.join(" ")}`, query, terms) + (task.dueDate ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.task);
}
