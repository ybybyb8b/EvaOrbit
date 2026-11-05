import assert from "node:assert/strict";
import test from "node:test";
import { filterLibrary, libraryWebsite, libraryEntryFromRow, libraryEntryToRow, type LibraryEntry } from "./software-library.ts";
import { parseSoftwareLibraryInput } from "./software-library-validation.ts";
const draft = () => ({name:"My software",category:"Tools",platforms:["macOS","iOS"],license:"perpetual",version:"",acquisition:"giveaway",acquiredOn:null,website:"https://example.com/tool",notes:"From a giveaway"});

test("software input preserves unknown dates and validates licence, platform, date and link", () => {
  const value=parseSoftwareLibraryInput({...draft(),platforms:["macOS","macOS"],name:"  My tool  ",acquiredOn:""});
  assert.equal(value.name,"My tool");assert.equal(value.acquiredOn,null);assert.deepEqual(value.platforms,["macOS"]);
  for(const change of [{name:" "},{name:"x".repeat(81)},{platforms:[]},{platforms:["unknown"]},{license:"trial"},{acquisition:"subscription"},{license:"version",version:" "},{acquiredOn:"2026-02-30"},{website:"javascript:alert(1)"},{website:"https://name:secret@example.com"}])assert.throws(()=>parseSoftwareLibraryInput({...draft(),...change}));
  assert.equal(parseSoftwareLibraryInput({...draft(),license:"version",version:" V2 "}).version,"V2");
  assert.equal(parseSoftwareLibraryInput({...draft(),version:"old",acquiredOn:"2026-10-24"}).version,"");
  const item={...value,id:1,createdAt:"",updatedAt:""} as LibraryEntry;
  assert.equal(filterLibrary([item]," giveaway ","giveaway","Tools","macOS").length,1);
  assert.equal(filterLibrary([item],"","paid","","macOS").length,0);
  assert.equal(filterLibrary([{...item,acquisition:"gift"}],"","giveaway","","").length,1);
  assert.deepEqual(filterLibrary([],"","all","",""),[]);
});

test("software links accept public web schemes and reject executable, malformed or credential URLs", () => {
  assert.equal(libraryWebsite(" https://example.com/app "), "https://example.com/app");
  assert.equal(libraryWebsite(""), "");
  for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/test", "example.com", "https://name:secret@example.com"]) assert.equal(libraryWebsite(value), null);
});

test("software row mapping round trips JSON platforms and date-only values",()=>{
  const input=parseSoftwareLibraryInput(draft()),row=libraryEntryToRow(input);
  for(const platforms of [row.platforms,JSON.stringify(row.platforms)]){
    const entry=libraryEntryFromRow({...row,id:3,platforms,created_at:"created",updated_at:"updated"});
    assert.deepEqual(entry,{...input,id:3,iconPath:"",createdAt:"created",updatedAt:"updated"});
  }
});


test("software supports an alternate searchable name and optional iOS region selections",()=>{
 const value=parseSoftwareLibraryInput({...draft(),alternateName:"  双语工具  ",iosRegions:["CN","US"]});
 assert.equal(value.alternateName,"双语工具");assert.deepEqual(value.iosRegions,["CN","US"]);
 const entry={...value,id:1,iconPath:"",createdAt:"",updatedAt:""};assert.equal(filterLibrary([entry],"双语工具","all","","").length,1);
 assert.deepEqual(parseSoftwareLibraryInput({...draft(),iosRegions:["US","US"]}).iosRegions,["US"]);
 assert.deepEqual(parseSoftwareLibraryInput({...draft(),platforms:["macOS"],iosRegions:["CN"]}).iosRegions,[]);
 assert.equal(parseSoftwareLibraryInput({...draft(),alternateName:null}).alternateName,"");
 for(const change of [{alternateName:3},{alternateName:"x".repeat(81)},{iosRegions:"CN"},{iosRegions:["JP"]},{iosRegions:[null]},{iosRegions:["CN","US","CN"]}])assert.throws(()=>parseSoftwareLibraryInput({...draft(),...change}));
 const old=libraryEntryFromRow({...libraryEntryToRow(value),alternate_name:undefined,ios_regions:undefined,id:2,created_at:"old",updated_at:"old"});assert.equal(old.alternateName,"");assert.deepEqual(old.iosRegions,[]);
});
