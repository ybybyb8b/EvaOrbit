import "server-only";
import { removeSoftwareLibraryImage } from "./software-library-icon";
import { getRepository } from "../repositories";
import { parseSoftwareLibraryInput } from "../software-library-validation";
export async function listSoftwareLibrary(){return (await getRepository()).listSoftwareLibrary();}
export async function createSoftwareLibraryEntry(value:unknown){return (await getRepository()).createSoftwareLibraryEntry(parseSoftwareLibraryInput(value));}
export async function updateSoftwareLibraryEntry(id:number,value:unknown){return (await getRepository()).updateSoftwareLibraryEntry(id,parseSoftwareLibraryInput(value));}
export async function deleteSoftwareLibraryEntry(id:number){const repository=await getRepository(),item=await repository.getSoftwareLibraryEntry(id);const removed=await repository.deleteSoftwareLibraryEntry(id);if(removed&&item?.iconPath)await removeSoftwareLibraryImage(id,item.iconPath).catch(error=>console.warn("Software icon cleanup failed",error));return removed;}
