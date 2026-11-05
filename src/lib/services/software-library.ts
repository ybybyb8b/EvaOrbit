import "server-only";
import { removeSoftwareLibraryImage } from "./software-library-icon";
import { getRepository } from "../repositories";
import { parseSoftwareLibraryInput } from "../software-library-validation";
export async function listSoftwareLibrary(){return (await getRepository()).listSoftwareLibrary();}
export async function getSoftwareLibraryEntry(id:number){return (await getRepository()).getSoftwareLibraryEntry(id);}
export async function createSoftwareLibraryEntry(value:unknown){return (await getRepository()).createSoftwareLibraryEntry(parseSoftwareLibraryInput(value));}
export async function updateSoftwareLibraryEntry(id:number,value:unknown){
  const repository=await getRepository(),current=await repository.getSoftwareLibraryEntry(id);if(!current)return null;
  const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const input={...body,...(body.alternateName===undefined?{alternateName:current.alternateName??""}:{}),...(body.iosRegions===undefined?{iosRegions:current.iosRegions??[]}:{}),...(body.purchaseAmount===undefined?{purchaseAmount:current.purchaseAmountMinor==null?null:(current.purchaseAmountMinor/100).toFixed(2)}:{}),...(body.purchaseCurrency===undefined?{purchaseCurrency:current.purchaseCurrency}: {})};
  return repository.updateSoftwareLibraryEntry(id,parseSoftwareLibraryInput(input));
}
export async function deleteSoftwareLibraryEntry(id:number){const repository=await getRepository(),item=await repository.getSoftwareLibraryEntry(id);const removed=await repository.deleteSoftwareLibraryEntry(id);if(removed&&item?.iconPath)await removeSoftwareLibraryImage(id,item.iconPath).catch(error=>console.warn("Software icon cleanup failed",error));return removed;}
