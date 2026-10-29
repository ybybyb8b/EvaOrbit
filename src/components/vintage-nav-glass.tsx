"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** One continuous surface: level shoulders blend into the raised Log rim. */
export function VintageNavGlass() {
  const ref=useRef<SVGSVGElement>(null);
  const [width,setWidth]=useState(400);
  useLayoutEffect(()=>{
    const element=ref.current;
    if(!element)return;
    const measure=()=>{const next=element.getBoundingClientRect().width;if(next>0)setWidth(next);};
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  const c=width/2;
  const d=`M32 12 H${c-78} C${c-56} 12 ${c-46} 12 ${c-32} 6 C${c-22} 2 ${c-12} 0 ${c} 0 C${c+12} 0 ${c+22} 2 ${c+32} 6 C${c+46} 12 ${c+56} 12 ${c+78} 12 H${width-32} A32 32 0 0 1 ${width} 44 A32 32 0 0 1 ${width-32} 76 H32 A32 32 0 0 1 0 44 A32 32 0 0 1 32 12 Z`;
  return <>
    <svg className="vintage-nav-shadow" viewBox={`0 0 ${width} 76`} preserveAspectRatio="none" aria-hidden="true"><path d={d}/></svg>
    <span className="vintage-nav-material" style={{clipPath:`path("${d}")`}} aria-hidden="true"/>
    <svg ref={ref} className="vintage-nav-outline" viewBox={`0 0 ${width} 76`} preserveAspectRatio="none" aria-hidden="true"><path d={d} fill="none" vectorEffect="non-scaling-stroke"/></svg>
  </>;
}
