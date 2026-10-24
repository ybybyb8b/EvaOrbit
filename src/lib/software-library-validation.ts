import { dateOnly, ValidationError } from "./validation.ts";
import { libraryPlatforms, libraryWebsite, type LibraryInput } from "./software-library.ts";
export function parseSoftwareLibraryInput(value: unknown): LibraryInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("软件资料格式不正确");
  const body = value as Record<string, unknown>;
  const text = (key: string, label: string, max: number, required = false) => {
    const raw = body[key] ?? "";
    if (typeof raw !== "string" || raw.trim().length > max || required && !raw.trim()) throw new ValidationError(`${label}格式不正确`);
    return raw.trim();
  };
  const name = text("name", "软件名称", 80, true), category = text("category", "分类", 24);
  if (!Array.isArray(body.platforms) || !body.platforms.length || body.platforms.length > libraryPlatforms.length || !body.platforms.every(value => libraryPlatforms.includes(value))) throw new ValidationError("请选择有效的软件平台");
  if (body.license !== "perpetual" && body.license !== "version") throw new ValidationError("授权方式格式不正确");
  if (body.acquisition !== "paid" && body.acquisition !== "giveaway" && body.acquisition !== "gift") throw new ValidationError("获取方式格式不正确");
  const version = body.license === "version" ? text("version", "授权版本", 40, true) : "";
  const website = libraryWebsite(text("website", "官网链接", 2000));
  if (website === null) throw new ValidationError("官网链接需要完整的 http 或 https 地址");
  return { name, category, platforms: [...new Set(body.platforms)], license: body.license, acquisition: body.acquisition, version,
    acquiredOn: body.acquiredOn === null || body.acquiredOn === undefined || body.acquiredOn === "" ? null : dateOnly(body.acquiredOn, "获取日期"), website, notes: text("notes", "备注", 2000) };
}
