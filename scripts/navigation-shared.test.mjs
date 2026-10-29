import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import * as react from "react";
import * as runtime from "react/jsx-runtime";
import {renderToStaticMarkup} from "react-dom/server";
import * as icons from "reicon-react";
import ts from "typescript";
import {isFoodDrinkPath} from "../src/lib/page-navigation.ts";

function navigation(english=true){
  const exports={};const code=ts.transpileModule(readFileSync("src/components/app-navigation.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("require","exports",code)(name=>{
    if(name==="react")return react;if(name==="react/jsx-runtime")return runtime;if(name==="reicon-react")return icons;
    if(name.endsWith("locale-controller"))return {useLocale:()=>({english})};
    if(name.endsWith("page-navigation"))return {isFoodDrinkPath};
    if(name.endsWith("icons"))return {Icon:()=>createElement("svg")};
    throw Error(name);
  },exports);return exports;
}
test("Web sidebar preserves every space; local sidebar filters availability and shares active routes",()=>{
  const {AppSidebar}=navigation();
  const props={pathname:"/food/places/1",LinkComponent:"a",brandImage:null};
  const web=renderToStaticMarkup(createElement(AppSidebar,props));
  for(const path of ["/memo","/lucius","/tasks","/health","/projects","/subscriptions","/cats","/settings"])assert(web.includes(`href="${path}"`),path);
  assert(!web.includes('href="/insights"'));
  assert.match(web,/href="\/food-drink"[^>]*aria-current="page"/);
  const local=renderToStaticMarkup(createElement(AppSidebar,{...props,allowedPaths:new Set(["/","/trackers","/food-drink","/cats"])}));
  for(const path of ["/","/trackers","/food-drink","/cats","/settings"])assert(local.includes(`href="${path}"`),path);
  for(const path of ["/memo","/lucius","/tasks","/health","/projects","/subscriptions"])assert(!local.includes(`href="${path}"`),path);
  const chinese=renderToStaticMarkup(createElement(navigation(false).AppSidebar,{...props,pathname:"/cats"}));
  assert.match(chinese,/aria-label="咪子"/);assert.match(chinese,/aria-label="主导航"/);
});
