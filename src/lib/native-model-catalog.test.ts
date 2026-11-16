import test from 'node:test';
import assert from 'node:assert/strict';
import {findCatalogModels,applyCatalogSelection,clearModelPrices} from './native-model-catalog.ts';
import {supportsNativeEva,supportsNativeCatalog,nativeEvaMethods} from './native-eva.ts';
const rows=[
  {model:{id:'alpha/chat-pro',name:'Chat Pro',inputPrice:2,outputPrice:8,contextWindow:128000,priceSource:'openrouter' as const},family:'alpha',textCapability:'text' as const},
  {model:{id:'beta/chat-mini',name:'Chat Mini',inputPrice:0,outputPrice:0,contextWindow:32000},family:'beta',textCapability:'text' as const},
  {model:{id:'alpha/unknown',name:'Unknown'},family:'alpha',textCapability:'unknown' as const},
  {model:{id:'alpha/charged',name:'Charged',inputPrice:0,outputPrice:0,priceEstimateLimited:true},family:'alpha',textCapability:'text' as const},
];
const selected=new Set(['alpha/chat-pro']);

test('Model search combines keywords, ID and developer and keeps exact matches first',()=>{
  assert.deepEqual(findCatalogModels(rows,'ALPHA pro','',false,selected,'name').map(x=>x.model.id),['alpha/chat-pro']);
  assert.equal(findCatalogModels(rows,'beta/chat-mini','',false,selected,'name')[0].model.id,'beta/chat-mini');
  assert.equal(findCatalogModels(rows,'','beta',false,selected,'name').length,1);
  assert.equal(findCatalogModels(rows,'','',true,selected,'name').length,1);
});
test('Unknown prices sort last; zero and missing prices are different; conditional charges are not free',()=>{
  const sorted=findCatalogModels(rows,'','',false,selected,'input');
  assert.equal(sorted.at(-1)?.model.id,'alpha/unknown');
  assert.equal(findCatalogModels(rows,'','',false,selected,'context')[0].model.id,'alpha/chat-pro');
  assert.deepEqual(findCatalogModels(rows,'','',false,selected,'name',true).map(x=>x.model.id),['beta/chat-mini']);
});
test('Catalog selection preserves manual quotes and legacy labels while refreshing directory quotes',()=>{
  const manual={id:'alpha/chat-pro',name:'My alias',inputPrice:9,outputPrice:11};
  assert.equal(applyCatalogSelection(rows,[manual],selected,true)[0].inputPrice,9);
  assert.equal(applyCatalogSelection(rows,[manual],selected,true)[0].name,'My alias');
  assert.equal(applyCatalogSelection(rows,[manual],selected,true)[0].priceSource,'manual');
  assert.equal(applyCatalogSelection(rows,[{id:manual.id,name:manual.name,inputPrice:9}],selected,true)[0].outputPrice,undefined);
  assert.equal(applyCatalogSelection(rows,[{...manual,priceSource:'openrouter'}],selected,true)[0].inputPrice,2);
  assert.equal(applyCatalogSelection(rows,[],selected,true)[0].outputPrice,8);
});
test('Currency mismatch strips imported quotes, removed directory entries survive, selections stay bounded',()=>{
  assert.equal(applyCatalogSelection(rows,[],selected,false)[0].inputPrice,undefined);
  assert.equal(applyCatalogSelection(rows,[{id:'saved',name:'Saved'}],new Set(['saved']),true)[0].name,'Saved');
  assert.throws(()=>applyCatalogSelection(rows,[],new Set(['not-in-directory']),true));
  assert.throws(()=>applyCatalogSelection(rows,[],new Set(Array.from({length:51},(_,i)=>String(i))),true));
  assert.equal(clearModelPrices({id:'x',name:'x',inputPrice:2,priceSource:'manual'}).priceSource,undefined);
});
test('Optional discovery methods do not disable existing Native chat on old Hosts',()=>{
  const info={methods:[...nativeEvaMethods]};
  assert(supportsNativeEva(info));assert(!supportsNativeCatalog(info));
  assert(supportsNativeCatalog({methods:[...nativeEvaMethods,'ai.listModels','ai.cancelModelList']}));
});
