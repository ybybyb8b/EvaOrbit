import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {NavigationBackControl} from "@/components/navigation-back-control";
import {DownloadStatusButton} from "./download-status";
type Action={back:()=>void};
const Context=createContext<{action:Action|null;register:(action:Action)=>()=>void;fallback?:()=>void}|null>(null);
export function LocalNavigationProvider({children,fallback}:{children:ReactNode;fallback?:()=>void}){
 const [action,setAction]=useState<Action|null>(null);
 const register=useCallback((next:Action)=>{setAction(next);return()=>setAction(current=>current===next?null:current);},[]);
 return <Context.Provider value={{action,register,fallback}}>{children}</Context.Provider>;
}
// A page declares its destination; only the shell renders a back button.
export function LocalBackAction({onBack}:{onBack:(()=>void)|undefined}){
 const register=useContext(Context)?.register,latest=useRef(onBack),active=Boolean(onBack);
 useLayoutEffect(()=>{latest.current=onBack;});
 useEffect(()=>active?register?.({back:()=>latest.current?.()}):undefined,[register,active]);return null;
}
export function LocalDesktopBack(){const value=useContext(Context),onBack=value?.action?.back??value?.fallback;return <header className="desktop-page-navigation">{onBack&&<NavigationBackControl onClick={onBack}/>}<DownloadStatusButton/></header>;}
export function LocalNavigationHeader({spaces}:{spaces:ReactNode}){
 const value=useContext(Context),onBack=value?.action?.back??value?.fallback,header=useRef<HTMLElement>(null);
 useEffect(()=>{const update=()=>header.current?.style.setProperty("--header-opacity",String(Math.min(1,Math.max(0,window.scrollY/80))));update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[]);
 return <><header ref={header} className="mobile-global-header">{onBack&&<NavigationBackControl onClick={onBack}/>}<div className="local-header-actions"><DownloadStatusButton/>{spaces}</div></header></>;
}
