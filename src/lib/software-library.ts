export const libraryPlatforms = ["macOS", "iOS", "Windows", "Android", "Web"] as const;
export type LibraryPlatform = typeof libraryPlatforms[number];
export const libraryIOSRegions=["CN","US"] as const;
export type LibraryIOSRegion=typeof libraryIOSRegions[number];
export type LibraryAcquisition = "paid" | "giveaway" | "gift";
export type LibraryEntry = {
  id: number; iconPath: string; name: string; category: string; platforms: LibraryPlatform[];
  license: "perpetual" | "version"; version: string; acquisition: LibraryAcquisition;
  acquiredOn: string | null; website: string; notes: string; createdAt: string; updatedAt: string;
  purchaseAmountMinor?: number | null; purchaseCurrency?: string | null;
  alternateName?:string; iosRegions?:LibraryIOSRegion[];
};
export type LibraryInput = Omit<LibraryEntry, "id" | "iconPath" | "createdAt" | "updatedAt">;
export function libraryWebsite(value: string) {
  if (!value.trim()) return "";
  try { const url = new URL(value.trim()); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function filterLibrary(entries: LibraryEntry[], query: string, acquisition: "all" | LibraryAcquisition, category: string, platform: string) {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (acquisition === "all" || entry.acquisition === acquisition || acquisition === "giveaway" && entry.acquisition === "gift")
    && (!category || entry.category === category) && (!platform || entry.platforms.includes(platform as LibraryPlatform))
    && (!needle || [entry.name, entry.alternateName??"", entry.category, entry.version, entry.notes, ...entry.platforms].join(" ").toLocaleLowerCase().includes(needle)));
}
export function libraryEntryFromRow(row: Record<string, unknown>): LibraryEntry {
  return { id: Number(row.id), iconPath: String(row.icon_path ?? ""), name: String(row.name),alternateName:String(row.alternate_name??""),iosRegions:(typeof row.ios_regions==="string"?JSON.parse(row.ios_regions):row.ios_regions??[]) as LibraryIOSRegion[],category: String(row.category), platforms: (typeof row.platforms === "string" ? JSON.parse(row.platforms) : row.platforms) as LibraryPlatform[],
    license: row.license as LibraryEntry["license"], version: String(row.version), acquisition: row.acquisition as LibraryAcquisition,
    acquiredOn: row.acquired_on ? String(row.acquired_on) : null, purchaseAmountMinor:row.purchase_amount_minor==null?null:Number(row.purchase_amount_minor),purchaseCurrency:row.purchase_currency==null?null:String(row.purchase_currency),website: String(row.website), notes: String(row.notes), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function libraryEntryToRow(input: LibraryInput) {
  return { name: input.name,alternate_name:input.alternateName??"",ios_regions:input.iosRegions??[],category: input.category, platforms: input.platforms, license: input.license, version: input.version,
    acquisition: input.acquisition, acquired_on: input.acquiredOn, purchase_amount_minor:input.purchaseAmountMinor??null,purchase_currency:input.purchaseCurrency??null,website: input.website, notes: input.notes };
}
export function librarySpend(entries:LibraryEntry[]){
  const totals:Record<string,number>={};let recorded=0;
  for(const item of entries)if(item.purchaseAmountMinor!=null&&item.purchaseCurrency){recorded++;totals[item.purchaseCurrency]=(totals[item.purchaseCurrency]??0)+item.purchaseAmountMinor;}
  return {totals,recorded,unknown:entries.length-recorded};
}
