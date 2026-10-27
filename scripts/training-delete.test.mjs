import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";

const code=ts.transpileModule(readFileSync("src/app/health/training-log-editor.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function fixture({accepted=false,ok=true,preview=false,workout=false}={}){
 const requests=[],events=[],stateWrites=[],api={};
 const jsx=(type,props)=>({type,props});
 const record={id:9,occurredAt:"2026-10-27T06:00:00Z",occurredHasExplicitTime:true,trainingType:"strength",bodyParts:[],teacher:"",course:"",durationMinutes:40,notes:"",trainingContent:"",workout:workout?{}:undefined};
 new Function("require","exports","confirm",code)(name=>{
  if(name==="react")return{useRef:value=>({current:value}),useState:value=>[typeof value==="function"?value():value,next=>stateWrites.push(next)]};
  if(name==="react/jsx-runtime")return{jsx,jsxs:jsx};
  if(name.endsWith("health-data-context"))return{useHealthData:()=>({read:async(path,init)=>{requests.push({path,...init});return{ok};}})};
  if(name.endsWith("form-preview"))return{useFormPreview:()=>preview,FormPreviewNotice:"preview"};
  if(name.endsWith("locale-controller"))return{useLocale:()=>({english:true})};
  if(name.endsWith("date-time-field"))return{compactDateTimeValue:()=>"2026-10-27T14:00",DateTimeField:"date"};
  if(name.endsWith("client-json-cache"))return{invalidateCachedJson:path=>events.push(["invalidate",path])};
  if(name.endsWith("action-toast"))return{showActionToast:()=>events.push("toast")};
  if(name.endsWith("/types"))return{TRAINING_BODY_PARTS:[]};
  return new Proxy({},{get:(_,key)=>String(key)});
 },api,()=>{events.push("confirm");return accepted;});
 const tree=api.TrainingLogEditor({record,suggestions:{teachers:[],courses:[],presets:[]},onSaved(){},onDeleted:()=>events.push("deleted"),onClose:()=>events.push("closed")});
 const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
 return{button:nodes(tree).find(node=>node.props?.className==="danger-text training-delete"),requests,events,stateWrites};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test("manual training deletion only sends DELETE after explicit confirmation",async()=>{
 const cancelled=fixture();cancelled.button.props.onClick();await settle();assert.deepEqual(cancelled.requests,[]);assert.deepEqual(cancelled.events,["confirm"]);
 const confirmed=fixture({accepted:true});confirmed.button.props.onClick();await settle();
 assert.deepEqual(confirmed.requests,[{path:"/api/health/training/9",method:"DELETE"}]);
 assert.deepEqual(confirmed.events,["confirm",["invalidate","/api/health/training/suggestions"],"deleted","toast","closed"]);
});
test("failed deletion keeps the editor open; preview and Apple workouts cannot delete",async()=>{
 const failed=fixture({accepted:true,ok:false});failed.button.props.onClick();await settle();
 assert.equal(failed.events.includes("closed"),false);assert.equal(failed.events.includes("deleted"),false);assert.ok(failed.stateWrites.includes("Could not delete training"));
 const preview=fixture({accepted:true,preview:true});assert.equal(preview.button.props.disabled,true);preview.button.props.onClick();await settle();assert.deepEqual(preview.requests,[]);assert.deepEqual(preview.events,[]);
 assert.equal(fixture({workout:true}).button,undefined);
});
