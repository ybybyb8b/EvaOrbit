import "server-only";
import { encryptAiApiKey, resolveAiApiKey } from "../ai-secret";
import { barkDeviceKey, sendBark, type BarkSettings, type BarkStatus } from "../push/bark";
import { getRepository } from "../repositories";
import { ValidationError } from "../validation";

export function barkStatus(settings:BarkSettings|null):BarkStatus{return{configured:Boolean(settings),enabled:Boolean(settings?.enabled)};}
export async function getBarkStatus(){return barkStatus(await(await getRepository()).getBarkSettings());}
export async function saveBarkConnection(value:unknown){
  if(!value||typeof value!=="object")throw new ValidationError("Bark 设置格式不正确");
  const body=value as Record<string,unknown>;
  if(typeof body.enabled!=="boolean")throw new ValidationError("请选择是否启用 Bark");
  const repository=await getRepository(),existing=await repository.getBarkSettings();
  let settings=existing;
  if(body.url!==undefined&&body.url!==""){
    let key:string;try{key=barkDeviceKey(body.url);}catch(error){throw new ValidationError((error as Error).message);}
    settings={...encryptAiApiKey(key),enabled:body.enabled};
  }else if(existing)settings={...existing,enabled:body.enabled};
  if(!settings)throw new ValidationError("请先粘贴 Bark 推送地址");
  await repository.saveBarkSettings(settings);
  return barkStatus(settings);
}
export async function testBarkConnection(){
  const settings=await(await getRepository()).getBarkSettings();
  if(!settings)throw new ValidationError("请先保存 Bark 推送地址");
  const accepted=await sendBark(resolveAiApiKey(settings),{kind:"reminder_due",title:"EvaOrbit · Bark 测试",body:"点击打开 EO 通知页面。",url:"/settings/notifications"});
  if(!accepted)throw new ValidationError("Bark 未接受测试通知，请检查地址和网络后重试");
  return{accepted:true};
}
