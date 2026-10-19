import React,{memo,useLayoutEffect,useMemo,useRef} from 'react';
import type {Anchor} from '../../../../packages/score-contracts';
import type {Marker} from './feedback-v2';
import {noteName} from '../platform/midi-v2';
import {noteSvgKey,sharedInk,type NativeGlyph} from './note-ink';

// Repaint exact MuseScore paths over the unchanged native page image. No
// notehead approximation, bounding-box fill, glyph re-engraving or hit matcher.
export const NoteInk=memo(function NoteInk({glyphs,anchors,markers}:{glyphs:NativeGlyph[];anchors:Anchor[];markers:Map<string,Marker>}){
  const layer=useRef<SVGGElement>(null),nodes=useRef<{element:SVGElement;anchors:Anchor[];title:SVGTitleElement}[]>([]);
  const byKey=useMemo(()=>new Map(anchors.flatMap(a=>{const key=noteSvgKey(a.id);return key?[[key,a] as const]:[];})),[anchors]);
  useLayoutEffect(()=>{
    const ns='http://www.w3.org/2000/svg',fragment=document.createDocumentFragment();nodes.current=[];
    for(const glyph of glyphs){
      const matched=glyph.keys.flatMap(key=>byKey.get(key)??[]);if(!matched.length)continue;
      const element=document.createElementNS(ns,glyph.tag) as SVGElement;
      for(const [name,value] of glyph.attributes)element.setAttribute(name,value);
      element.setAttribute('data-native-part',glyph.part);
      element.setAttribute('data-anchor',matched[0].id);
      element.setAttribute('data-note-anchors',matched.map(a=>a.id).join(' '));
      element.setAttribute('data-pitch',matched.map(a=>a.pitch).join(' '));
      element.style.display='none';
      // Preserve hollow heads, line-only stems and the native stroke width.
      if(element.getAttribute('fill')!=='none')element.style.fill='currentColor';
      if(element.hasAttribute('stroke')&&element.getAttribute('stroke')!=='none')element.style.stroke='currentColor';
      const title=document.createElementNS(ns,'title');element.append(title);fragment.append(element);nodes.current.push({element,anchors:matched,title});
    }
    layer.current?.replaceChildren(fragment);
    return()=>{layer.current?.replaceChildren();nodes.current=[];};
  },[glyphs,byKey]);
  useLayoutEffect(()=>{
    for(const {element,anchors,title} of nodes.current){
      const marker=sharedInk(anchors.map(a=>markers.get(a.id)));
      element.style.display=marker?'':'none';
      element.setAttribute('class',marker?`note-marker ${marker.kind}${marker.held?' held':''}`:'');
      if(marker){element.setAttribute('data-held',String(!!marker.held));title.textContent=`${anchors.map(a=>noteName(a.pitch)).join(' · ')} · ${marker.label}`;}
      else{element.removeAttribute('data-held');title.textContent='';}
    }
  },[glyphs,byKey,markers]);
  return <g ref={layer} className="practice-note-ink" aria-label="Màu nốt luyện tập"/>;
});
