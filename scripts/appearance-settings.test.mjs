import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("shared appearance controls retain all values; local saves never call the cloud", async () => {
  for (const localOnly of [true, false]) {
    const updates=[], requests=[], states=[]; let cursor=0,fail=false;
    const preference={designTheme:"classic",appearanceMode:"system",colorTheme:"editorial",language:"en",english:true,loadFailed:true,chineseFont:"canger",englishFont:"ibm",setPreferences:value=>{if(fail)throw Error("Storage unavailable");updates.push(value);}};
    const jsx=(type,props)=>({type,props});
    const imported={"@/lib/theme":{APPEARANCE_MODES:["system","light","dark"],COLOR_THEMES:["editorial","rosewood","powderblue","mistviolet"],DESIGN_THEMES:["classic","vintage"]},react:{useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=value];}},"react/jsx-runtime":{jsx,jsxs:jsx},"@/components/locale-controller":{useLocale:()=>preference},"@/components/error-notice":{ErrorNotice:"error"},"@/components/action-toast":{ToastNotice:"toast"},"@/lib/locale":{UI_LANGUAGES:["zh-CN","en"]},"@/lib/font-preferences":{CHINESE_FONTS:["canger","lxgw","alimama","ibm"],ENGLISH_FONTS:["zen","ibm","polyamine","cormorant"]}};
    const loaded={};
    const code=ts.transpileModule(readFileSync("src/components/appearance-settings.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    new Function("require","exports","fetch",code)(name=>{assert(name in imported,name);return imported[name];},loaded,async(url,options)=>{requests.push({url,...options});return{ok:true};});
    const tree=loaded.AppearanceSettings({localOnly});
    const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
    const buttons=nodes(tree).filter(node=>node.type==="button");
    assert.match(nodes(tree).find(node=>node.type==="error").props.children,/Could not load appearance settings/);
    assert.equal(buttons.length,19);
    const text=node=>typeof node==="string"?node:Array.isArray(node)?node.map(text).join(""):text(node?.props?.children??"");
    await buttons.find(node=>text(node).startsWith("Rosewood")).props.onClick();
    assert.deepEqual(updates,[{designTheme:"classic",appearanceMode:"system",colorTheme:"rosewood",uiLanguage:"en",chineseFont:"canger",englishFont:"ibm"}]);
    assert.equal(requests.length,localOnly?0:1);
    if(!localOnly){assert.equal(requests[0].method,"PATCH");assert.deepEqual(JSON.parse(requests[0].body),updates[0]);}
    const count=requests.length;
    await buttons.find(node=>text(node).startsWith("Vintage")).props.onClick();
    assert.equal(updates.at(-1).designTheme,"vintage");
    assert.equal(updates.at(-1).colorTheme,"editorial");
    assert.equal(requests.length,count+(localOnly?0:1),"design selection follows the same persistence as other appearance preferences");
    const afterDesign=requests.length;
    preference.designTheme="vintage";cursor=0;
    const vintageNodes=nodes(loaded.AppearanceSettings({localOnly}));
    assert.equal(vintageNodes.filter(node=>node.props?.className==="appearance-classic-colors").length,0);
    assert.equal(vintageNodes.filter(node=>node.type==="button").length,15);
    fail=true;
    await buttons.find(node=>text(node).startsWith("Dark")).props.onClick();
    assert.equal(requests.length,afterDesign,"a failed local save must not be followed by a cloud write");
    assert(states.includes("Storage unavailable"));
  }
});
