import { detectAvatarImage } from "./avatar.ts";
import { ValidationError } from "./validation.ts";

export type ImportantDateBackground = {kind:"none"}|{kind:"solid";color:string}|{kind:"gradient";color:string;secondary:string}|{kind:"photo";x:number;y:number;shade:number;zoom?:number;image?:string};
export const importantDatePhotoMaxBytes=100000-1;
export function parseImportantDateBackground(raw:unknown):ImportantDateBackground|undefined{
  if(raw===undefined)return undefined;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new ValidationError("卡片背景格式不正确");
  const value=raw as Record<string,unknown>,kind=value.kind;
  const allowed=kind==="none"?["kind"]:kind==="solid"?["kind","color"]:kind==="gradient"?["kind","color","secondary"]:kind==="photo"?["kind","x","y","shade","zoom","image"]:[];
  if(!allowed.length||Object.keys(value).some(key=>!allowed.includes(key)))throw new ValidationError("卡片背景包含未知字段");
  const color=(key:string)=>{const result=value[key];if(typeof result!=="string"||!/^#[a-f0-9]{6}$/i.test(result))throw new ValidationError("请选择有效的背景颜色");return result;};
  const number=(key:string,fallback:number,max:number)=>{const result=value[key]===undefined?fallback:value[key];if(typeof result!=="number"||!Number.isFinite(result)||result<0||result>max)throw new ValidationError("背景位置或明暗超出范围");return result;};
  if(kind==="none")return {kind};
  if(kind==="solid")return {kind,color:color("color")};
  if(kind==="gradient")return {kind,color:color("color"),secondary:color("secondary")};
  let image:string|undefined;
  if(value.image!==undefined){
    if(typeof value.image!=="string"||value.image.length>180000)throw new ValidationError("背景图片过大");
    const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.image);
    if(!match)throw new ValidationError("背景只接受 JPG、PNG 或 WebP 图片");
    let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));}catch{throw new ValidationError("背景图片编码无效");}
    if(bytes.length>importantDatePhotoMaxBytes||detectAvatarImage(bytes)?.mime!==match[1])throw new ValidationError("背景图片格式或大小不正确");
    image=value.image;
  }
  return {kind:"photo",x:number("x",50,100),y:number("y",50,100),shade:number("shade",.35,1),zoom:(()=>{const zoom=number("zoom",1,3);if(zoom<1)throw new ValidationError("缩放须为 1—3 倍");return zoom;})(),...(image?{image}:{})};
}

export function importantDateBackgroundRow(background:ImportantDateBackground|undefined){
  if(background===undefined)return {};
  if(background.kind!=="photo")return {background,background_image:null};
  const {image,...settings}=background;
  return {background:settings,...(image!==undefined?{background_image:image}:{})};
}
