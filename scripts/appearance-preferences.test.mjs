import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { normalizeAppearanceMode, normalizeColorTheme } from "../src/lib/theme.ts";
import { normalizeUiLanguage } from "../src/lib/locale.ts";
import { normalizeChineseFont, normalizeEnglishFont } from "../src/lib/font-preferences.ts";

function runtime(values={}){
  const stored=new Map(Object.entries(values)),applied=[];
  const imports={"./theme":{normalizeAppearanceMode,normalizeColorTheme},"./locale":{normalizeUiLanguage},"./font-preferences":{normalizeChineseFont,normalizeEnglishFont},"./theme-runtime":{APPEARANCE_MODE_STORAGE_KEY:"evaorbit.appearanceMode",COLOR_THEME_STORAGE_KEY:"evaorbit.colorTheme",applyAppearance:(...args)=>applied.push(args)},"./locale-runtime":{UI_LANGUAGE_STORAGE_KEY:"evaorbit.uiLanguage",applyUiLanguage:(...args)=>applied.push(args)},"./font-runtime":{CHINESE_FONT_STORAGE_KEY:"evaorbit.chineseFont",ENGLISH_FONT_STORAGE_KEY:"evaorbit.englishFont",applyFonts:(...args)=>applied.push(args)}};
  const loaded={},storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const code=ts.transpileModule(readFileSync("src/lib/appearance-preferences.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function("require","exports","localStorage",code)(name=>imports[name],loaded,storage);
  return{...loaded,stored,applied,storage};
}
test("shared preferences preserve legacy keys and match first paint for Web and local defaults",()=>{
 for(const localOnly of [false,true])for(const values of [{},{"evaorbit.uiLanguage":"zh-CN","evaorbit.englishFont":"zen","evaorbit.colorTheme":"rosewood","evaorbit.appearanceMode":"dark"},{"evaorbit.uiLanguage":"bad","evaorbit.englishFont":"bad"}]){
  const f=runtime(values),defaults=localOnly?f.LOCAL_APPEARANCE_BASELINE:{};
  const preferences=f.storedAppearancePreferences(defaults);
  const root={dataset:localOnly?{localAppearance:"true"}:{},style:{}};
  runInNewContext(readFileSync("public/theme-init.js","utf8"),{document:{documentElement:root},localStorage:f.storage,matchMedia:()=>({matches:false})});
  assert.equal(root.lang,preferences.uiLanguage);assert.equal(root.dataset.englishFont,preferences.englishFont);assert.equal(root.dataset.theme,preferences.colorTheme);
  f.applyAppearancePreferences(preferences);
  assert.equal(f.stored.get("evaorbit.englishFont"),preferences.englishFont);
  assert.equal(f.stored.get("evaorbit.uiLanguage"),preferences.uiLanguage);
 }
 const f=runtime();
 assert.equal(f.storedAppearancePreferences().uiLanguage,"zh-CN","Web defaults remain unchanged");
 assert.equal(f.storedAppearancePreferences(f.LOCAL_APPEARANCE_BASELINE).englishFont,"ibm","the August compatibility key is preserved");
 f.storage.getItem=()=>{throw Error("Storage denied");};
 assert.equal(f.storedAppearancePreferences(f.LOCAL_APPEARANCE_BASELINE).uiLanguage,"en");
});
