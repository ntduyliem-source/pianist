import React,{useEffect,useState} from 'react';
import {workspace as ws} from '../workspace';
import {noteName} from '../platform/midi-v2';

export function PracticePiano({held,expected,expanded,onToggle,hidden}:{held:number[];expected:number[];expanded:boolean;onToggle:()=>void;hidden:boolean}){
  const[octave,setOctave]=useState(4),from=Math.min(92,octave*12);
  const notes=Array.from({length:36},(_,i)=>from+i),black=(n:number)=>[1,3,6,8,10].includes(n%12),white=notes.filter(n=>!black(n));
  useEffect(()=>{
    const keys=['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';'],pressed=new Map<string,number>();
    const release=()=>{for(const n of pressed.values())ws.midi.virtual(n,false);pressed.clear();};
    const down=(e:KeyboardEvent)=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||(e.target as HTMLElement).closest('input,select,textarea'))return;const i=keys.indexOf(e.key.toLowerCase());if(i<0)return;e.preventDefault();pressed.set(e.code,from+12+i);ws.midi.virtual(from+12+i,true);};
    const up=(e:KeyboardEvent)=>{const n=pressed.get(e.code);if(n!==undefined){ws.midi.virtual(n,false);pressed.delete(e.code);}};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',release);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',release);release();};
  },[from]);
  const button=(n:number)=>({'aria-label':noteName(n),'aria-pressed':held.includes(n),disabled:ws.midi.deviceId!=='virtual',
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);ws.midi.virtual(n,true);},onPointerUp:()=>ws.midi.virtual(n,false),onPointerCancel:()=>ws.midi.virtual(n,false),onLostPointerCapture:()=>ws.midi.virtual(n,false),
    onKeyDown:(e:React.KeyboardEvent)=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();ws.midi.virtual(n,true);}},onKeyUp:(e:React.KeyboardEvent)=>{if([' ','Enter'].includes(e.key)){e.preventDefault();ws.midi.virtual(n,false);}},onBlur:()=>ws.midi.virtual(n,false)});
  return <section className="practice-piano" hidden={hidden} aria-label="Bàn phím hỗ trợ"><div className="practice-piano-heading"><span><strong>Bàn phím</strong><span className="v2-muted"> · {held.length?held.map(noteName).join(' · '):'Chưa giữ phím'}</span></span><div className="v2-row"><label hidden={!expanded}>Quãng <select aria-label="Quãng bàn phím" value={octave} onChange={e=>setOctave(+e.target.value)}>{[0,1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{noteName(Math.min(92,n*12))}–{noteName(Math.min(92,n*12)+35)}</option>)}</select></label><button aria-expanded={expanded} aria-controls="practice-keyboard" onClick={onToggle}>{expanded?'⌄ Thu gọn':'⌃ Mở bàn phím'}</button></div></div>
    <div id="practice-keyboard" className="piano" hidden={!expanded}>{white.map(n=><button key={n} {...button(n)} className={'white-key'+(expected.includes(n)?' expected':'')+(held.includes(n)?' held':'')} style={{width:100/white.length+'%'}}><span>{noteName(n)}</span></button>)}{notes.filter(black).map(n=><button key={n} {...button(n)} className={'black-key'+(expected.includes(n)?' expected':'')+(held.includes(n)?' held':'')} style={{width:65/white.length+'%',left:(white.filter(x=>x<n).length-.325)*100/white.length+'%'}}><span>{noteName(n)}</span></button>)}</div>
  </section>;
}
