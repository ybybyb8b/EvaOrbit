import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { newTrackerLocalId } from "../src/lib/tracker-local-store.ts";
import { parseNewTrackerField } from "../src/lib/validation.ts";

test("the shared Web/local create form retains all seven property types and failed drafts", async () => {
  const slots=[], saves=[]; let cursor=0, tree, fail=true, closed=0;
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];},useMemo:fn=>fn(),useEffect(){}};
  const jsx=(type,props)=>({type,props});
  const imported={react,"react/jsx-runtime":{jsx,jsxs:jsx},"@/components/form-sheet":{FormSheet:"sheet"},"@/components/choice-select":{ChoiceSelect:"select"},"@/components/suggested-input":{SuggestedInput:"suggestion"},"@/components/error-notice":{ErrorNotice:"error"},"@/components/icons":{Icon:"icon"},"@/lib/tracker-local-store":{newTrackerLocalId},"./tracker-capture-toggle":{TrackerCaptureToggle:"toggle"}};
  const loaded={};
  const code=ts.transpileModule(readFileSync("src/app/trackers/tracker-create-sheet.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("require","exports",code)(name=>{if(!(name in imported))throw Error(name);return imported[name];},loaded);
  const render=()=>{cursor=0;tree=loaded.TrackerCreateSheet({groupNames:["日常"],allowImages:false,onClose:()=>closed++,onCreate:async input=>{saves.push(input);if(fail)throw Error("Disk full");}});};
  const nodes=(node=tree)=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(child=>nodes(child??null)):[node,...nodes(node.props?.children??null)];
  const find=predicate=>nodes().find(predicate);
  render();
  find(node=>node.type==="input"&&node.props.maxLength===80).props.onChange({target:{value:"完整观测"}});render();
  for(let index=0;index<7;index++){
    const strip=find(node=>node.props.className==="tracker-field-type-strip");
    strip.props.children[index].props.onClick();render();
    find(node=>node.type==="input"&&node.props.autoFocus).props.onChange({target:{value:"属性"+index}});render();
    const options=find(node=>node.type==="input"&&node.props.placeholder==="Home, Outside, Work");
    if(options){options.props.onChange({target:{value:"Home,Outside"}});render();}
    find(node=>node.type==="button"&&node.props.children==="Add property").props.onClick();render();
  }
  const submit=()=>find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  await submit();render();
  assert.equal(closed,0);
  assert.equal(find(node=>node.type==="error").props.children,"Disk full");
  assert.equal(find(node=>node.type==="input"&&node.props.maxLength===80).props.value,"完整观测");
  assert.equal(saves[0].fields.length,7);
  for(const field of saves[0].fields)assert.doesNotThrow(()=>parseNewTrackerField({...field,key:field.clientId,options:field.options.split(",").filter(Boolean),precision:Number(field.precision)},1));
  fail=false;await submit();render();
  assert.equal(closed,1);
  assert.deepEqual(saves[1],saves[0]);
});
