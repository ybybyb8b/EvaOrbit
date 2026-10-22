import {createContext,useContext,type ComponentProps} from "react";

export const LocalRouteContext=createContext({path:"/",navigate:(_path:string)=>{void _path;}});
export function useLocalInitialPath(fallback:string){const {path}=useContext(LocalRouteContext);return path==="/"?fallback:path;}
export function LocalRouteLink({href,onClick,children,...props}:ComponentProps<"a">&{href:string}){
 const {navigate}=useContext(LocalRouteContext);
 return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();navigate(href);}}}>{children}</a>;
}
