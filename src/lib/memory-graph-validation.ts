import { dateOnly, ValidationError } from "./validation.ts";
import type { MemoryEntityStatus, MemoryFactStatus } from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Memory Graph input must be an object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${field} is required.`);
  const result = value.trim();
  if (result.length > max) throw new ValidationError(`${field} is too long.`);
  return result;
}

function nullableText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max);
}

export function memoryUuid(value: unknown, field = "id") {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new ValidationError(`${field} must be a UUID.`);
  return value.toLowerCase();
}

function aliases(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new ValidationError("aliases must contain at most 50 strings.");
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const alias = text(item, "alias", 200);
    const key = alias.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(alias); }
  }
  return result;
}

function numberInRange(value: unknown, field: string, min: number, max: number, fallback: number, integer = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new ValidationError(`${field} must be ${integer ? "an integer " : ""}between ${min} and ${max}.`);
  return value;
}

function entityStatus(value: unknown): MemoryEntityStatus {
  if (value === "active" || value === "archived" || value === "merged") return value;
  throw new ValidationError("Memory Entity status is invalid.");
}

function factStatus(value: unknown): MemoryFactStatus {
  if (value === "active" || value === "invalidated") return value;
  throw new ValidationError("Memory Fact status is invalid.");
}

export function parseNewMemoryEntity(value: unknown) {
  const body = object(value);
  return { canonicalName: text(body.canonicalName, "canonicalName", 200), entityType: text(body.entityType, "entityType", 80), aliases: aliases(body.aliases), description: nullableText(body.description, "description", 5000) };
}

export function parseMemoryEntityPatch(value: unknown) {
  const body = object(value);
  const result = {
    canonicalName: body.canonicalName === undefined ? undefined : text(body.canonicalName, "canonicalName", 200),
    entityType: body.entityType === undefined ? undefined : text(body.entityType, "entityType", 80),
    aliases: body.aliases === undefined ? undefined : aliases(body.aliases),
    description: body.description === undefined ? undefined : nullableText(body.description, "description", 5000),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("No Memory Entity fields to update.");
  return result;
}

export function parseMemoryEntitySearch(value: unknown) {
  const body = object(value);
  if (body.includeMerged !== undefined && typeof body.includeMerged !== "boolean") throw new ValidationError("includeMerged must be a boolean.");
  return {
    entityType: body.entityType === undefined ? undefined : text(body.entityType, "entityType", 80),
    status: body.status === undefined ? undefined : entityStatus(body.status),
    includeMerged: body.includeMerged as boolean | undefined,
  };
}

export function parseNewMemoryFact(value: unknown) {
  const body = object(value);
  const objectEntityId = body.objectEntityId === undefined || body.objectEntityId === null ? null : memoryUuid(body.objectEntityId, "objectEntityId");
  const hasObjectValue = Object.hasOwn(body, "objectValue") && body.objectValue !== undefined && body.objectValue !== null;
  if ((objectEntityId === null) === !hasObjectValue) throw new ValidationError("Exactly one of objectEntityId or objectValue is required.");
  const validFrom = body.validFrom === undefined || body.validFrom === null || body.validFrom === "" ? null : dateOnly(body.validFrom, "validFrom");
  const validTo = body.validTo === undefined || body.validTo === null || body.validTo === "" ? null : dateOnly(body.validTo, "validTo");
  if (validFrom && validTo && validTo < validFrom) throw new ValidationError("validTo cannot be earlier than validFrom.");
  if (hasObjectValue && JSON.stringify(body.objectValue).length > 20000) throw new ValidationError("objectValue is too large.");
  return {
    subjectEntityId: memoryUuid(body.subjectEntityId, "subjectEntityId"), predicate: text(body.predicate, "predicate", 120), objectEntityId,
    objectValue: hasObjectValue ? body.objectValue : null,
    perspectiveEntityId: body.perspectiveEntityId === undefined || body.perspectiveEntityId === null ? null : memoryUuid(body.perspectiveEntityId, "perspectiveEntityId"),
    confidence: numberInRange(body.confidence, "confidence", 0, 1, 1), importance: numberInRange(body.importance, "importance", 1, 5, 3, true), validFrom, validTo,
  };
}

export function parseMemoryFactPatch(value: unknown) {
  const body = object(value);
  const result = {
    confidence: body.confidence === undefined ? undefined : numberInRange(body.confidence, "confidence", 0, 1, 1),
    importance: body.importance === undefined ? undefined : numberInRange(body.importance, "importance", 1, 5, 3, true),
    validFrom: body.validFrom === undefined ? undefined : body.validFrom === null || body.validFrom === "" ? null : dateOnly(body.validFrom, "validFrom"),
    validTo: body.validTo === undefined ? undefined : body.validTo === null || body.validTo === "" ? null : dateOnly(body.validTo, "validTo"),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("No Memory Fact fields to update.");
  if (result.validFrom && result.validTo && result.validTo < result.validFrom) throw new ValidationError("validTo cannot be earlier than validFrom.");
  return result;
}

export function parseMemoryFactSearch(value: unknown) {
  const body = object(value);
  const direction = body.direction === undefined ? undefined : body.direction;
  if (direction !== undefined && direction !== "in" && direction !== "out" && direction !== "both") throw new ValidationError("direction must be in, out, or both.");
  return {
    entityId: body.entityId === undefined ? undefined : memoryUuid(body.entityId, "entityId"), direction: direction as "in" | "out" | "both" | undefined,
    predicate: body.predicate === undefined ? undefined : text(body.predicate, "predicate", 120),
    perspectiveEntityId: body.perspectiveEntityId === undefined ? undefined : body.perspectiveEntityId === null ? null : memoryUuid(body.perspectiveEntityId, "perspectiveEntityId"),
    status: body.status === undefined ? undefined : factStatus(body.status),
    validOn: body.validOn === undefined ? undefined : dateOnly(body.validOn, "validOn"),
  };
}

export function parseNewMemorySource(value: unknown) {
  const body = object(value);
  const result = {
    factId: memoryUuid(body.factId, "factId"), sourceResource: text(body.sourceResource, "sourceResource", 100),
    sourceRecordId: nullableText(body.sourceRecordId, "sourceRecordId", 300), sourceUrl: nullableText(body.sourceUrl, "sourceUrl", 2000),
    excerpt: nullableText(body.excerpt, "excerpt", 10000), note: nullableText(body.note, "note", 2000),
  };
  if (!result.sourceRecordId && !result.sourceUrl && !result.excerpt && !result.note) throw new ValidationError("A Memory Source needs a record id, URL, excerpt, or note.");
  if (result.sourceUrl && !/^https?:\/\//i.test(result.sourceUrl)) throw new ValidationError("sourceUrl must use HTTP or HTTPS.");
  return result;
}

export function parseMemorySourcePatch(value: unknown) {
  const body = object(value);
  const result = {
    sourceUrl: body.sourceUrl === undefined ? undefined : nullableText(body.sourceUrl, "sourceUrl", 2000),
    excerpt: body.excerpt === undefined ? undefined : nullableText(body.excerpt, "excerpt", 10000),
    note: body.note === undefined ? undefined : nullableText(body.note, "note", 2000),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("No Memory Source fields to update.");
  if (result.sourceUrl && !/^https?:\/\//i.test(result.sourceUrl)) throw new ValidationError("sourceUrl must use HTTP or HTTPS.");
  return result;
}
