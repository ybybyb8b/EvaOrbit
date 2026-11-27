import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { normalizeAppearanceMode, normalizeVintageColorway } from "../src/lib/theme.ts";
import { normalizeUiLanguage } from "../src/lib/locale.ts";
import { normalizeChineseFont, normalizeEnglishFont } from "../src/lib/font-preferences.ts";

function runtime(values={}){
  const stored=new Map(Object.entries(values)),applied=[];
  const imports={"./theme":{normalizeAppearanceMode,normalizeVintageColorway},"./locale":{normalizeUiLanguage},"./font-preferences":{normalizeChineseFont,normalizeEnglishFont},"./theme-runtime":{APPEARANCE_MODE_STORAGE_KEY:"evaorbit.appearanceMode",VINTAGE_COLORWAY_STORAGE_KEY:"evaorbit.vintageColorway",applyAppearance:(...args)=>applied.push(args)},"./locale-runtime":{UI_LANGUAGE_STORAGE_KEY:"evaorbit.uiLanguage",applyUiLanguage:(...args)=>applied.push(args)},"./font-runtime":{CHINESE_FONT_STORAGE_KEY:"evaorbit.chineseFont",ENGLISH_FONT_STORAGE_KEY:"evaorbit.englishFont",applyFonts:(...args)=>applied.push(args)}};
  const loaded={},storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const code=ts.transpileModule(readFileSync("src/lib/appearance-preferences.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function("require","exports","localStorage",code)(name=>imports[name],loaded,storage);
  return{...loaded,stored,applied,storage};
}
test("first paint uses Vintage even with saved Classic preferences",()=>{
 for(const localOnly of [false,true])for(const values of [{},{"evaorbit.homeStyle":"vintage"},{"evaorbit.homeStyle":"vintage","evaorbit.designTheme":"classic"},{"evaorbit.designTheme":"vintage","evaorbit.colorTheme":"powderblue"},{"evaorbit.uiLanguage":"zh-CN","evaorbit.englishFont":"zen","evaorbit.colorTheme":"rosewood","evaorbit.appearanceMode":"dark"},{"evaorbit.uiLanguage":"bad","evaorbit.englishFont":"bad"}]){
  const f=runtime(values),defaults=localOnly?f.LOCAL_APPEARANCE_BASELINE:{};
  const preferences=f.storedAppearancePreferences(defaults);
  const root={dataset:localOnly?{localAppearance:"true"}:{},style:{}};
  runInNewContext(readFileSync("public/theme-init.js","utf8"),{document:{documentElement:root,querySelector:()=>null},localStorage:f.storage,matchMedia:()=>({matches:false})});
  assert.equal(root.lang,preferences.uiLanguage);assert.equal(root.dataset.englishFont,preferences.englishFont);assert.equal(root.dataset.theme,"vintage");
  assert.equal(root.dataset.designTheme,"vintage");assert.equal(root.dataset.vintageColorway,preferences.vintageColorway);
  f.applyAppearancePreferences(preferences);
  assert.equal(f.stored.get("evaorbit.designTheme"),values["evaorbit.designTheme"]);
  assert.deepEqual(f.applied[0],[preferences.appearanceMode,preferences.vintageColorway]);
  assert.equal(f.stored.get("evaorbit.englishFont"),preferences.englishFont);
  assert.equal(f.stored.get("evaorbit.uiLanguage"),preferences.uiLanguage);
 }
 const f=runtime();
 assert.equal(f.storedAppearancePreferences().uiLanguage,"zh-CN","Web defaults remain unchanged");
 assert.equal(f.storedAppearancePreferences(f.LOCAL_APPEARANCE_BASELINE).englishFont,"ibm","the August compatibility key is preserved");
 f.storage.getItem=()=>{throw Error("Storage denied");};
 assert.equal(f.storedAppearancePreferences(f.LOCAL_APPEARANCE_BASELINE).uiLanguage,"en");
});

test("Vintage colorways survive persistence and first paint in both shells",()=>{
 for(const vintageColorway of ["mauve-ivory","oat-plum","invalid"])for(const mode of ["light","dark","system"]) {
 const f=runtime({"evaorbit.vintageColorway":vintageColorway,"evaorbit.appearanceMode":mode});
 const value=f.storedAppearancePreferences();f.applyAppearancePreferences(value);
 const root={dataset:{},style:{}},meta={setAttribute:(key,value)=>meta[key]=value};
 runInNewContext(readFileSync("public/theme-init.js","utf8"),{document:{documentElement:root,querySelector:()=>meta},localStorage:f.storage,matchMedia:()=>({matches:true})});
 assert.equal(root.dataset.vintageColorway,value.vintageColorway);assert.equal(f.storedAppearancePreferences().vintageColorway,value.vintageColorway);
 assert.equal(meta.content,mode==="light"?(vintageColorway==="oat-plum"?"#f1eee6":"#f2f3f5"):(vintageColorway==="oat-plum"?"#25232a":"#202124"));
 }
});

test("Oat & Plum text and controls retain contrast on every base surface",()=>{
 const css=readFileSync("src/app/vintage-theme.css","utf8");
 const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 const blocks=[...css.matchAll(/html[^{}]*data-vintage-colorway="oat-plum"\]\s*\{([^}]+)\}/g)];
 assert.equal(blocks.length,2);
 for(const block of blocks){
 const colors=Object.fromEntries([...block[1].matchAll(/--([\w-]+):(#\w{6})[;]/g)].map(m=>[m[1],m[2]]));
 for(const background of ["surface-canvas","surface-card","surface-soft","surface-tint","surface-warm"])for(const foreground of ["text-primary","text-secondary","text-tertiary","accent-primary","state-danger","state-success","state-warning","state-info"].filter(key=>colors[key])) assert(contrast(colors[foreground],colors[background])>=4.5,foreground+" on "+background);
 assert(contrast(colors["action-primary"],colors["action-primary-ink"])>=4.5);
 for(const background of ["surface-card","surface-soft","surface-tint"])assert(contrast(colors["border-control"],colors[background])>=3,"control boundary on "+background);
 }
});
