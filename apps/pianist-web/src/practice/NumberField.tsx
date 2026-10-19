import React,{useEffect,useState} from 'react';

type Props=Omit<React.InputHTMLAttributes<HTMLInputElement>,'onChange'|'value'|'onBlur'> & {value:number;onValue:(value:number)=>void};
// Commit a complete value. Intermediate digits must not shorten A–B, change the
// other endpoint, or repeatedly invalidate/rebuild the practice timeline.
export function NumberField({value,onValue,min,max,...props}:Props){
  const[draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=(text:string)=>{
    if(!text.trim()||!Number.isFinite(Number(text))){setDraft(String(value));return;}
    const next=Math.max(Number(min??-Infinity),Math.min(Number(max??Infinity),Number(text)));
    setDraft(String(next));if(next!==value)onValue(next);
  };
  return <input {...props} type="number" min={min} max={max} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={e=>commit(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
