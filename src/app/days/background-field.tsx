"use client";
import { useEffect,useRef,useState,type PointerEvent } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { ImageUploadField } from "@/components/image-upload-field";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { importantDateDisplay,type ImportantDate,type ImportantDateInput } from "@/lib/important-dates";
import { importantDatePhotoMaxBytes,parseImportantDateBackground,type ImportantDateBackground } from "@/lib/important-date-background";
import { DateBackground,useDateBackgroundImage } from "./date-background";
import styles from "./days.module.css";

export function BackgroundField({draft,item,today,onChange,onBusy}:{draft:ImportantDateInput;item:ImportantDate|null;today:string;onChange:(value:ImportantDateBackground)=>void;onBusy:(busy:boolean)=>void}){
  const {english}=useLocale(),[error,setError]=useState("");
  const background=draft.background??{kind:"none"},preview={id:item?.id??0,background,backgroundImageVersion:item?.backgroundImageVersion};
  const image=useDateBackgroundImage(preview),display=importantDateDisplay(draft,today,english);
  const dimensions=useRef<{width:number;height:number}|null>(null);
  useEffect(()=>{dimensions.current=null;if(!image)return;const source=new Image();source.onload=()=>{dimensions.current={width:source.naturalWidth,height:source.naturalHeight};};source.src=image;return()=>{source.onload=null;};},[image]);
  const drag=useRef<{x:number;y:number;originX:number;originY:number}|null>(null);
  function startDrag(event:PointerEvent<HTMLDivElement>){if(background.kind!=="photo"||!image)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,originX:background.x,originY:background.y};}
  function moveDrag(event:PointerEvent<HTMLDivElement>){if(!drag.current||background.kind!=="photo")return;const bounds=event.currentTarget.getBoundingClientRect(),size=dimensions.current;if(!size)return;const scale=Math.max(bounds.width/size.width,bounds.height/size.height)*(background.zoom??1),overflowX=size.width*scale-bounds.width,overflowY=size.height*scale-bounds.height;onChange({...background,x:Math.max(0,Math.min(100,drag.current.originX-(overflowX>1?(event.clientX-drag.current.x)/overflowX*100:0))),y:Math.max(0,Math.min(100,drag.current.originY-(overflowY>1?(event.clientY-drag.current.y)/overflowY*100:0)))});}
  async function choose(file:File){
    setError("");onBusy(true);let bitmap:ImageBitmap|undefined;
    try{
      bitmap=await createImageBitmap(file);const canvas=document.createElement("canvas"),context=canvas.getContext("2d");if(!context)throw new Error();
      let result="";
      for(const edge of [1024,768,512,384]){
        const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [.8,.6,.4]){result=canvas.toDataURL("image/jpeg",quality);if((result.length-result.indexOf(",")-1)*.75<=importantDatePhotoMaxBytes)break;}
        if((result.length-result.indexOf(",")-1)*.75<=importantDatePhotoMaxBytes)break;
      }
      const next=parseImportantDateBackground({kind:"photo",x:50,y:50,shade:.35,image:result});if(!next)throw new Error();onChange(next);
    }catch{setError(english?"Could not read this image. Choose a valid JPG, PNG or WebP.":"未能处理图片，请选择有效的 JPG、PNG 或 WebP 图片。");}finally{bitmap?.close();onBusy(false);}
  }
  function setKind(kind:ImportantDateBackground["kind"]){setError("");onChange(kind==="none"?{kind}:kind==="solid"?{kind,color:"#cbbbc2"}:kind==="gradient"?{kind,color:"#cab8c5",secondary:"#e5d8c3"}:background.kind==="photo"?background:{kind:"photo",x:50,y:50,shade:.35});}
  return <div className={styles.backgroundFields}>
    <ChoiceSelect aria-label={english?"Card background":"卡片背景"} value={background.kind} onChange={event=>setKind(event.target.value as ImportantDateBackground["kind"])}><option value="none">{english?"Theme":"主题材质"}</option><option value="solid">{english?"Color":"纯色"}</option><option value="gradient">{english?"Gradient":"渐变"}</option><option value="photo">{english?"Photo":"照片"}</option></ChoiceSelect>
    {background.kind!=="none"&&<div className={`${styles.backgroundSample} ${styles.themeCard}`} data-cropping={background.kind==="photo"&&Boolean(image)||undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><DateBackground item={preview}/><span className="user-content">{draft.title||(english?"An important day":"值得期待的日子")}</span><strong>{display.text}</strong><small>{display.unit}</small></div>}
    {(background.kind==="solid"||background.kind==="gradient")&&<div className={styles.backgroundColors}><label>{english?"Color":"背景颜色"}<input type="color" value={background.color} onChange={event=>onChange({...background,color:event.target.value})}/></label>{background.kind==="gradient"&&<label>{english?"Second color":"另一端颜色"}<input type="color" value={background.secondary} onChange={event=>onChange({...background,secondary:event.target.value})}/></label>}</div>}
    {background.kind==="photo"&&<>
      <ImageUploadField title={english?"Background photo":"背景照片"} inputLabel={english?"Choose background photo":"选择背景照片"} shape="landscape" source={image} hasImage={Boolean(image||item?.backgroundImageVersion)} maxBytes={20*1024*1024} onSelect={file=>void choose(file)} onRemove={image||item?.backgroundImageVersion?()=>onChange({kind:"none"}):undefined} help={english?"Compressed below 100 KB on this device, then saved with the date.":"在本机压缩至 100 KB 以下，与日子一起保存。"}/>
      {image&&<p className={styles.hint}>{english?"Drag the photo to frame it. Use the sliders for precise positioning and zoom.":"在预览中拖动照片调整构图，也可用下方滑杆精确定位与缩放。"}</p>}
      {(image||item?.backgroundImageVersion)&&<div className={styles.photoSliders}>{(["x","y","zoom","shade"] as const).map(key=><label key={key}><span>{key==="x"?english?"Horizontal position":"水平位置":key==="y"?english?"Vertical position":"垂直位置":key==="zoom"?english?"Zoom":"缩放":english?"Shade":"明暗遮罩"}</span><input aria-label={key==="x"?english?"Horizontal position":"水平位置":key==="y"?english?"Vertical position":"垂直位置":key==="zoom"?english?"Zoom":"缩放":english?"Shade":"明暗遮罩"} type="range" min={key==="zoom"?1:0} max={key==="shade"?1:key==="zoom"?3:100} step={key==="shade"||key==="zoom"?.05:1} value={background[key]??1} onChange={event=>onChange({...background,[key]:Number(event.target.value)})}/></label>)}</div>}
    </>}
    {error&&<ErrorNotice inline>{error}</ErrorNotice>}
  </div>;
}
