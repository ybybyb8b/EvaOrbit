import type {EvaDiscoveredModel,EvaModel} from './native-eva.ts';

export type CatalogSort="name"|"input"|"output"|"context";
export function findCatalogModels(models:readonly EvaDiscoveredModel[],query:string,family:string,selectedOnly:boolean,selected:ReadonlySet<string>,sort:CatalogSort,freeOnly=false) {
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches=models.filter(item=>{
    const text=`${item.model.id} ${item.model.name} ${item.family}`.toLocaleLowerCase();
    return terms.every(term=>text.includes(term))&&(!family||item.family===family)&&(!selectedOnly||selected.has(item.model.id))&&(!freeOnly||(item.model.inputPrice===0&&item.model.outputPrice===0&&item.model.priceEstimateLimited!==true));
  });
  const rank=(item:EvaDiscoveredModel)=>item.model.id.toLocaleLowerCase()===query.trim().toLocaleLowerCase()?0:item.model.id.toLocaleLowerCase().startsWith(query.trim().toLocaleLowerCase())?1:2;
  return matches.sort((a,b)=>{
    if(sort==="name"&&terms.length){const delta=rank(a)-rank(b);if(delta)return delta;}
    if(sort!=="name"){
      const field=sort==="input"?"inputPrice":sort==="output"?"outputPrice":"contextWindow";
      const x=a.model[field],y=b.model[field];
      if(x===undefined&&y!==undefined)return 1;if(y===undefined&&x!==undefined)return -1;
      if(x!==undefined&&y!==undefined&&x!==y)return sort==="context"?y-x:x-y;
    }
    return a.model.name.localeCompare(b.model.name)||a.model.id.localeCompare(b.model.id);
  });
}

export function clearModelPrices(model:EvaModel):EvaModel {
  const next={...model};
  delete next.inputPrice;delete next.outputPrice;delete next.cachedInputPrice;
  delete next.priceSource;delete next.priceUpdatedAt;
  return next;
}

export function applyCatalogSelection(catalog:readonly EvaDiscoveredModel[],previous:readonly EvaModel[],ids:ReadonlySet<string>,importPrices:boolean):EvaModel[] {
  if(ids.size>50)throw new Error('Select at most 50 models.');
  const saved=new Map(previous.filter(m=>m.id.trim()).map(m=>[m.id,m]));
  const directory=new Map(catalog.map(item=>[item.model.id,item.model]));
  return [...ids].map(id=>{
    const old=saved.get(id),fresh=directory.get(id);
    if(!fresh){if(!old)throw new Error('Model is not in this directory.');return old;}
    const incoming=importPrices?fresh:clearModelPrices(fresh);
    if(!old)return {...incoming};
    const hasManualPrice=old.priceSource!=="openrouter"&&[old.inputPrice,old.outputPrice,old.cachedInputPrice].some(p=>p!==undefined);
    // Preserve manual quotes and labels. Directory refreshes never rewrite old message snapshots.
    return hasManualPrice?{...clearModelPrices(incoming),...old,priceSource:"manual",priceEstimateLimited:old.priceEstimateLimited||fresh.priceEstimateLimited}:{...clearModelPrices(old),...incoming,name:old.name};
  });
}
