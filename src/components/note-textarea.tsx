"use client";

import {useLayoutEffect,useRef,type ComponentProps} from "react";

function resize(input:HTMLTextAreaElement|null){
  if(!input?.getClientRects().length)return;
  input.style.height="auto";
  input.style.height=`${input.scrollHeight+input.offsetHeight-input.clientHeight}px`;
}

export function NoteTextarea({value,defaultValue,onInput,onFocus,...props}:Omit<ComponentProps<"textarea">,"ref"|"rows">){
  const input=useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{resize(input.current);},[value,defaultValue]);
  useLayoutEffect(()=>{
    const element=input.current;if(!element)return;
    let width=-1;
    const observer=new ResizeObserver(()=>{
      if(element.clientWidth===width)return;
      width=element.clientWidth;resize(element);
    });
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  return <textarea {...props} ref={input} rows={1} data-note-input value={value} defaultValue={defaultValue}
    onInput={event=>{resize(event.currentTarget);onInput?.(event);}}
    onFocus={event=>{resize(event.currentTarget);onFocus?.(event);}}/>;
}
