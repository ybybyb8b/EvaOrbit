"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {evaCall,evaIsBusy,nativeEvaEvent,type EvaProvider,type EvaState,type EvaModel,type EvaModelCatalog} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {showActionToast} from "./action-toast";
import styles from "./native-eva-settings.module.css";
import {Disclosure} from "./disclosure";
import {useNativeEva} from "./native-eva-context";
import {NativeModelPicker} from "./native-model-picker";
import {applyCatalogSelection,clearModelPrices} from "@/lib/native-model-catalog";

const blankModel=():EvaModel=>({id:"",name:""});
const blankProvider=():EvaProvider=>({id:crypto.randomUUID(),name:"",baseURL:"",models:[blankModel()],enabled:true,currency:"USD",priceUpdatedAt:""});

export function NativeEvaSettings({accountId,onSaved}:{accountId:string;onSaved?:()=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const {catalogSupported,subscriptionSupported}=useNativeEva();
  const [connection,setConnection]=useState<"api"|"subscription">("api");
  const [persona,setPersona]=useState<EvaState["persona"]|null>(null);
  const [subscription,setSubscription]=useState<EvaProvider|null>(null);
  const [directory,setDirectory]=useState<EvaModelCatalog|null>(null),[pickerOpen,setPickerOpen]=useState(false),[discovering,setDiscovering]=useState(false),[catalogNotice,setCatalogNotice]=useState("");
  const session=useRef({alive:true,fetching:false,cancelled:false});
  useEffect(()=>{const current={alive:true,fetching:false,cancelled:false};session.current=current;return()=>{current.alive=false;if(current.fetching)void evaCall(accountId,"ai.cancelModelList").catch(()=>{});};},[accountId]);
  const [providers,setProviders]=useState<EvaProvider[]>([]),[draft,setDraft]=useState<EvaProvider>(blankProvider);
  const [apiKey,setApiKey]=useState(""),[clearKey,setClearKey]=useState(false),[error,setError]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[active,setActive]=useState(false);
  const load=useCallback(async()=>{const value=await evaCall<EvaState>(accountId,"ai.getState");setPersona(value.persona);setProviders(value.providers.filter(p=>p.connectionType!=="subscription"));setSubscription(value.providers.find(p=>p.connectionType==="subscription")??(value.subscriptionConnected?{id:"00000000-0000-4000-8000-000000000220",name:"ChatGPT",baseURL:"",models:[],enabled:true,currency:"USD",priceUpdatedAt:"",connectionType:"subscription"}:null));setActive(evaIsBusy(value));},[accountId]);
  useEffect(()=>{let alive=true;void evaCall<EvaState>(accountId,"ai.getState").then(value=>{if(alive){setPersona(value.persona);setProviders(value.providers.filter(p=>p.connectionType!=="subscription"));setSubscription(value.providers.find(p=>p.connectionType==="subscription")??(value.subscriptionConnected?{id:"00000000-0000-4000-8000-000000000220",name:"ChatGPT",baseURL:"",models:[],enabled:true,currency:"USD",priceUpdatedAt:"",connectionType:"subscription"}:null));setActive(evaIsBusy(value));const first=value.providers.find(p=>p.connectionType!=="subscription");if(first)setDraft(first);}}).catch(reason=>{if(alive)setError(reason.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[accountId]);
  useEffect(()=>{const clear=()=>{if(document.hidden||!navigator.onLine){setApiKey("");if(session.current.fetching){session.current.cancelled=true;void evaCall(accountId,"ai.cancelModelList").catch(()=>{});}}};document.addEventListener("visibilitychange",clear);window.addEventListener("offline",clear);return()=>{document.removeEventListener("visibilitychange",clear);window.removeEventListener("offline",clear);};},[accountId]);
  useEffect(()=>{let alive=true;const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.accountId===accountId&&(detail.eventType==="terminal"||detail.eventType==="configuration"))void evaCall<EvaState>(accountId,"ai.getState").then(value=>{if(alive)setActive(evaIsBusy(value));}).catch(()=>{});};window.addEventListener(nativeEvaEvent,update);return()=>{alive=false;window.removeEventListener(nativeEvaEvent,update);};},[accountId]);
  const existing=providers.find(p=>p.id===draft.id);
  const select=(provider?:EvaProvider)=>{setDraft(provider??blankProvider());setApiKey("");setClearKey(false);setError("");setDirectory(null);setCatalogNotice("");};
  async function save() {
    if(busy||discovering||active)return;
    setBusy(true);setError("");
    try {
      const provider={id:draft.id,name:draft.name,baseURL:draft.baseURL.trim(),models:draft.models,enabled:draft.enabled,currency:draft.currency,priceUpdatedAt:draft.priceUpdatedAt};
      await evaCall(accountId,"ai.saveProvider",{provider:{...provider,priceUpdatedAt:new Date().toISOString(),models:provider.models.map(m=>({...m,id:m.id.trim(),name:m.name.trim()||m.id.trim()}))},...(apiKey?{apiKey}:{}),...(clearKey?{clearKey:true}:{})});
      setApiKey("");setClearKey(false);await load();
      window.dispatchEvent(new CustomEvent(nativeEvaEvent,{detail:{accountId,eventType:"configuration"}}));
      showActionToast(t("Saved on this device","已保存到本机"));onSaved?.();
    } catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setBusy(false);setApiKey("");}
  }
  async function discoverModels() {
    if(discovering||session.current.fetching||busy||active||!catalogSupported||clearKey)return;
    const current=session.current;current.fetching=true;current.cancelled=false;
    setDiscovering(true);setError("");setCatalogNotice("");
    try {
      const result=await evaCall<EvaModelCatalog>(accountId,"ai.listModels",{providerId:draft.id,baseURL:draft.baseURL.trim(),...(apiKey?{apiKey}:{})});
      if(!current.alive||current.cancelled)return;
      setDirectory(result);setPickerOpen(true);
      if(!result.models.length)setCatalogNotice(t("No models returned. You can enter a Model ID manually.","接口没有返回模型，可手动填写 Model ID。"));
    }catch(reason){if(current.alive&&!current.cancelled)setError(reason instanceof Error?reason.message:String(reason));}
    finally{current.fetching=false;if(current.alive)setDiscovering(false);}
  }
  async function cancelDiscovery(){session.current.cancelled=true;try{await evaCall(accountId,"ai.cancelModelList");}catch{/* The original request reports connection failures. */}}
  function useModels(ids:ReadonlySet<string>){
    if(!directory)return;
    const importPrices=!directory.currency||directory.currency===draft.currency;
    try{setDraft({...draft,models:applyCatalogSelection(directory.models,draft.models,ids,importPrices)});setPickerOpen(false);if(!importPrices)setCatalogNotice(t("Directory prices use "+directory.currency+"; prices in "+draft.currency+" were not overwritten.","目录报价为 "+directory.currency+"，未写入当前 "+draft.currency+" 计价。"));}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  }
  function modelField(index:number,patch:Partial<EvaModel>){const priceEdited=["inputPrice","outputPrice","cachedInputPrice"].some(key=>key in patch);setDraft(current=>({...current,models:current.models.map((m,i)=>{if(i!==index)return m;if(patch.id!==undefined&&patch.id!==m.id)return {...clearModelPrices(m),...patch,contextWindow:undefined,priceEstimateLimited:undefined};return {...m,...patch,...(priceEdited?{priceSource:"manual" as const,priceUpdatedAt:new Date().toISOString()}: {})};})}));}

  async function subscriptionAction(method:"ai.subscriptionLogin"|"ai.subscriptionLogout"|"ai.subscriptionModels") {
    if(busy||active||discovering)return;
    if(method==="ai.subscriptionLogout"&&!window.confirm(t("Disconnect ChatGPT on this device? Chats are kept.","断开本机 ChatGPT 登录？聊天记录会保留。")))return;
    setBusy(true);setError("");
    try{await evaCall(accountId,method);showActionToast(t("Connection updated","连接已更新"));}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{try{await load();window.dispatchEvent(new CustomEvent(nativeEvaEvent,{detail:{accountId,eventType:"configuration"}}));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}setBusy(false);}
  }
  return <div className={styles.page} data-native-eva-settings>

    <div className={styles.connections} role="tablist" onKeyDown={event=>{if(busy||discovering||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?"api":event.key==="End"?"subscription":connection==="api"?"subscription":"api";setConnection(next);setApiKey("");setError("");event.currentTarget.querySelector<HTMLButtonElement>(next==="api"?"#parlor-api-tab":"#parlor-subscription-tab")?.focus();}} aria-label={t("Connection method","连接方式")}>
      <button role="tab" aria-selected={connection==="api"} aria-controls="parlor-api" id="parlor-api-tab" tabIndex={connection==="api"?0:-1} disabled={busy||discovering} onClick={()=>{setConnection("api");setApiKey("");setError("");}} className={styles.connection}><strong>API</strong><small>{t(`${providers.length}`,`${providers.length}`)}</small></button>
      <button role="tab" aria-selected={connection==="subscription"} aria-controls="parlor-subscription" id="parlor-subscription-tab" tabIndex={connection==="subscription"?0:-1} disabled={busy||discovering} onClick={()=>{setConnection("subscription");setApiKey("");setError("");}} className={styles.connection}><strong>{t("Subscription","订阅登录")}</strong></button>
    </div>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {loading?<p role="status">{t("Loading local settings…","正在读取本机配置…")}</p>:<>
    {active&&<p role="status">{t("Stop the active response before changing providers.","请先停止正在生成的回答，再修改配置。")}</p>}
    {connection==="subscription"?<section role="tabpanel" id="parlor-subscription" aria-labelledby="parlor-subscription-tab" className={styles.subscription}>
      <div className={styles.subscriptionHeader}><img src="/icons/subscriptions/openai.svg" width="40" height="40" alt=""/><div><h2>ChatGPT</h2><p>{subscription?.enabled?t("Connected","已连接"):t("Not connected","未连接")}</p></div></div>

      {!subscriptionSupported?<p role="status">{t("Update Host to sign in","更新 Host 后登录")}</p>:<div className={styles.directoryActions}><button className="button primary" disabled={busy||active} onClick={()=>void subscriptionAction(subscription?.enabled?"ai.subscriptionModels":"ai.subscriptionLogin")}>{busy?t("Connecting…","连接处理中…"):subscription?.enabled?t("Refresh models","刷新模型"):t("Sign in with ChatGPT","使用 ChatGPT 登录")}</button>{subscription&&<button className="text-button" disabled={busy||active} onClick={()=>void subscriptionAction("ai.subscriptionLogout")}>{t("Disconnect","断开连接")}</button>}</div>}
      {subscription&&<div className={styles.subscriptionModels}><h3>{t("Available models","可用模型")} <small>{subscription.models.length}</small></h3>{subscription.models.map(m=><div key={m.id}><strong>{m.name}</strong><span>{m.id}</span><button className="button secondary" disabled={busy||active||!persona||!subscription.enabled||(persona.providerId===subscription.id&&persona.modelId===m.id)} onClick={async()=>{if(!persona)return;setBusy(true);setError("");try{await evaCall(accountId,"ai.savePersona",{persona:{...persona,providerId:subscription.id,modelId:m.id}});await load();window.dispatchEvent(new CustomEvent(nativeEvaEvent,{detail:{accountId,eventType:"configuration"}}));showActionToast(t("Default model updated","默认模型已更新"));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}}>{persona?.providerId===subscription.id&&persona.modelId===m.id?t("In use","使用中"):t("Use in Parlor","在 Parlor 中使用")}</button></div>)}</div>}

    </section>:<section role="tabpanel" id="parlor-api" aria-labelledby="parlor-api-tab" className={styles.apiPanel}>
    <div className={styles.apiHeading}><div><h2>{t("API connections","API 连接")}</h2></div><button className="button secondary" disabled={busy||discovering||active} onClick={()=>select()}>{t("Add provider","添加服务商")}</button></div>
    <label className="field"><span>{t("Provider","服务商")}</span><select value={existing?draft.id:"new"} disabled={busy||discovering} onChange={event=>select(providers.find(p=>p.id===event.target.value))}>
      {providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="new">{t("Add provider","添加服务商")}</option>
    </select></label>
    <form className={styles.editor} onSubmit={event=>{event.preventDefault();void save();}}>
      <fieldset disabled={busy||active||discovering} className={styles.fields}>
        <label className="field"><span>{t("Name","名称")}</span><input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label className="field"><span>{t("API Base URL (HTTPS)","API Base URL（HTTPS）")}</span><input required type="url" maxLength={500} placeholder="https://provider.example/v1" value={draft.baseURL} onChange={e=>{setDraft({...draft,baseURL:e.target.value,models:draft.models.map(m=>m.priceSource==="openrouter"?clearModelPrices(m):m)});setApiKey("");setDirectory(null);setCatalogNotice("");}}/></label>
        {existing&&draft.baseURL!==existing.baseURL&&existing.hasKey&&<p>{t("Endpoint changed. Re-enter or remove the Key before saving.","端点已更改，请重新输入或移除密钥后保存。")}</p>}
        <label className="field"><span>API Key {existing?.hasKey&&<small>{t("Saved","已保存")}</small>}</span><input type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} disabled={clearKey} value={apiKey} placeholder={existing?.hasKey?t("Leave blank to keep the Key","留空保留原密钥"):t("Enter a local API Key","输入本机 API Key")} onChange={e=>{setApiKey(e.target.value);setDirectory(null);}}/></label>
        {existing?.hasKey&&<label className={styles.toggle}><input type="checkbox" checked={clearKey} onChange={e=>{setClearKey(e.target.checked);setApiKey("");}}/>{t("Remove saved Key","移除已保存密钥")}</label>}
        <label className={styles.toggle}><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>{t("Enable provider","启用服务商")}</label>
        <div className={styles.modelHeading}><h3>{t("Text models","文本模型")}</h3><span className={styles.catalogSummary}>{draft.models.filter(m=>m.id).length}/50</span></div>
        <div className={styles.directoryActions}><button type="button" className="button secondary" disabled={!catalogSupported||clearKey||(!apiKey&&!(existing?.hasKey&&existing.baseURL.replace(/\/+$/,"")===draft.baseURL.trim().replace(/\/+$/,"")))} onClick={()=>void discoverModels()}>{directory?t("Refresh list","刷新清单"):t("Fetch models","获取模型")}</button>{directory&&<button type="button" className="text-button" onClick={()=>setPickerOpen(true)}>{t("Choose models","选择模型")} ({directory.models.length})</button>}</div>
        {!catalogSupported&&<p className={styles.catalogSummary}>{t("Model list requires a Host update","获取模型需更新 Host")}</p>}
        {catalogNotice&&<p className={styles.catalogSummary} role="status">{catalogNotice}</p>}
        {draft.models.map((model,index)=><div className={styles.model} key={index}>
          <label className="field"><span>Model ID</span><input required maxLength={200} value={model.id} onChange={e=>modelField(index,{id:e.target.value})}/></label>
          <label className="field"><span>{t("Display name","显示名称")}</span><input maxLength={100} value={model.name} onChange={e=>modelField(index,{name:e.target.value})}/></label>
          <Disclosure title={t("Price / 1M tokens","价格 / 百万 Token")}>
            {model.priceSource==="openrouter"&&<p className={styles.catalogSummary}>OpenRouter · USD / {t("1M tokens","百万 Token")} · {model.priceUpdatedAt?new Date(model.priceUpdatedAt).toLocaleDateString():""}</p>}
            {model.priceEstimateLimited&&<p className={styles.catalogSummary}>{t("Conditional or extra charges apply; total cost stays unknown.","包含条件或额外计费，总费用保持未知。")}</p>}
            {([['inputPrice',t("Input","输入")],['outputPrice',t("Output","输出")],['cachedInputPrice',t("Cached input","缓存输入")]] as const).map(([field,label])=><label className="field" key={field}><span>{label}</span><input type="number" min={0} max={1000000} step="any" placeholder={t("Unknown","未知")} value={model[field]??""} onChange={e=>modelField(index,{[field]:e.target.value===""?undefined:Number(e.target.value)})}/></label>)}
          </Disclosure>
          {draft.models.length>1&&<button className="text-button" type="button" onClick={()=>setDraft({...draft,models:draft.models.filter((_,i)=>i!==index)})}>{t("Remove model","移除模型")}</button>}
        </div>)}
        <button type="button" className="text-button" disabled={draft.models.length>=50} onClick={()=>setDraft({...draft,models:[...draft.models,blankModel()]})}>{t("Add model","添加模型")}</button>
        <label className="field"><span>{t("Price currency","价格币种")}</span><input pattern="[A-Z]{3}" required maxLength={3} value={draft.currency} onChange={e=>{setDraft({...draft,currency:e.target.value.toUpperCase(),models:draft.models.map(clearModelPrices)});setCatalogNotice(t("Currency changed. Enter prices again or reselect models from the directory.","币种已改变，请重新填写价格或从清单选择模型。"));}}/></label>
        <button className="button primary" type="submit">{busy?t("Saving…","保存中…"):t("Save","保存")}</button>
        {existing&&<button className="text-button" type="button" onClick={async()=>{
          if(!window.confirm(t("Delete this provider and its local Key? Chat history is kept.","删除此服务商及其本机密钥？聊天历史会保留。")))return;
          setBusy(true);try{await evaCall(accountId,"ai.deleteProvider",{providerId:draft.id});await load();select();window.dispatchEvent(new CustomEvent(nativeEvaEvent,{detail:{accountId,eventType:"configuration"}}));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}
        }}>{t("Delete provider","删除服务商")}</button>}
      </fieldset>
    </form>
    </section>}
    {discovering&&<div className={styles.directoryActions} role="status"><span>{t("Fetching model list…","正在获取模型清单…")}</span><button type="button" className="text-button" onClick={()=>void cancelDiscovery()}>{t("Cancel","取消")}</button></div>}
    {pickerOpen&&directory&&<NativeModelPicker catalog={directory} models={draft.models} english={english} onApply={useModels} onClose={()=>setPickerOpen(false)}/>}
    </>}
  </div>;
}
