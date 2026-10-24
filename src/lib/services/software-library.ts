import "server-only";
import { getRepository } from "../repositories";
import { parseSoftwareLibraryInput } from "../software-library-validation";
export async function listSoftwareLibrary(){return (await getRepository()).listSoftwareLibrary();}
export async function createSoftwareLibraryEntry(value:unknown){return (await getRepository()).createSoftwareLibraryEntry(parseSoftwareLibraryInput(value));}
export async function updateSoftwareLibraryEntry(id:number,value:unknown){return (await getRepository()).updateSoftwareLibraryEntry(id,parseSoftwareLibraryInput(value));}
export async function deleteSoftwareLibraryEntry(id:number){return (await getRepository()).deleteSoftwareLibraryEntry(id);}
