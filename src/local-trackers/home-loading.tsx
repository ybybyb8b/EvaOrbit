import {useEffect,useState} from "react";
import {useLocale} from "@/components/locale-controller";

export function LocalHomeLoading(){
 const {english}=useLocale();
 const [reduced,setReduced]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)"),update=()=>setReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 return <div className="local-home-loading" role="status" aria-live="polite">
  <span className="sr-only">{english?"Loading Home":"正在加载首页"}</span>
  <div className="local-home-loading-art" aria-hidden="true">
   <svg viewBox="0 0 260 177" fill="none">
    <ellipse cx="130" cy="88.5" rx="114.4" ry="35.4" transform="rotate(-13.75 130 88.5)"/>
    <ellipse cx="130" cy="88.5" rx="104" ry="51.33" transform="rotate(14.32 130 88.5)"/>
    <ellipse cx="130" cy="88.5" rx="93.6" ry="59.3" transform="rotate(-2.29 130 88.5)" strokeDasharray="2 3" opacity=".58"/>
    <g transform="rotate(-13.75 130 88.5)"><circle className="local-home-loading-planet" r="6" cx={reduced?244.4:0} cy={reduced?88.5:0}>
     {!reduced&&<animateMotion dur="6.2s" repeatCount="indefinite" path="M244.4 88.5 A114.4 35.4 0 1 1 15.6 88.5 A114.4 35.4 0 1 1 244.4 88.5 Z"/>}
    </circle></g>
   </svg>
   <span className="local-home-loading-core"/>
  </div>
 </div>;
}
