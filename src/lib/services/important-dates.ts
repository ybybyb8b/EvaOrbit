import "server-only";
import { getRepository } from "../repositories";
import { parseImportantDateCategory,parseImportantDate } from "../important-dates-validation";

export async function listImportantDates() { return (await getRepository()).listImportantDates(); }
export async function getImportantDate(id:number) { return (await listImportantDates()).find(item=>item.id===id)??null; }
export async function saveImportantDate(id: number | null, value: unknown) { return (await getRepository()).saveImportantDate(id, parseImportantDate(value)); }
export async function removeImportantDate(id: number) { return (await getRepository()).deleteImportantDate(id); }

export async function listImportantDateCategories() { return (await getRepository()).listImportantDateCategories(); }

export async function saveImportantDateCategory(value:unknown){const input=parseImportantDateCategory(value);return (await getRepository()).saveImportantDateCategory(input.name,input.color);}
export async function getImportantDateBackground(id:number,version:string){return (await getRepository()).getImportantDateBackground(id,version);}
