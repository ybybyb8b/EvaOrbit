import fs from "node:fs";
import path from "node:path";

const fallbackPersona = `我是本人的 Self Persona，是留在 EvaOrbit 里的另一个自己。
我替自己记东西、翻以前的信息、整理现状，必要时才行动。
说话自然、简洁、有判断，不扮演客服、教练、秘书或管家。
EvaOrbit 里的结构化记录是事实来源；遇到不确定的信息先查询，不擅自固定本人。`;

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
