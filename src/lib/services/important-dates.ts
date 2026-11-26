import "server-only";
import { getRepository } from "../repositories";
import { parseImportantDate } from "../important-dates-validation";

export async function listImportantDates() { return (await getRepository()).listImportantDates(); }
export async function saveImportantDate(id: number | null, value: unknown) { return (await getRepository()).saveImportantDate(id, parseImportantDate(value)); }
export async function removeImportantDate(id: number) { return (await getRepository()).deleteImportantDate(id); }

export async function listImportantDateCategories() { return (await getRepository()).listImportantDateCategories(); }
