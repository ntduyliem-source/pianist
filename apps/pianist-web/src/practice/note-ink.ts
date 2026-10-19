import type {Marker} from './feedback-v2';

export interface NativeGlyph {tag:string;attributes:[string,string][];keys:string[];part:string}
// These are geometry/paint attributes on native SVG primitives. No HTML,
// event handlers, links, scripts, external paint servers or CSS are inserted.
const primitives=new Set(['path','polyline','polygon','line','rect','circle','ellipse']);
const geometry=new Set(['d','points','x','y','x1','y1','x2','y2','width','height','rx','ry','cx','cy','r','transform','fill-rule','clip-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','fill-opacity','stroke-opacity','opacity','vector-effect']);
const keyPattern=/^t\d+-v\d+-n\d+$/;

export function noteSvgKey(anchor:string){return /^m\d+-(t\d+-v\d+-n\d+)$/.exec(anchor)?.[1];}

export function parseNativeGlyphs(svg:string):NativeGlyph[]{
  const root=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(root.querySelector('parsererror'))return [];
  const result:NativeGlyph[]=[];
  for(const element of root.querySelectorAll('[data-practice-notes]')){
    if(!primitives.has(element.localName))continue;
    const keys=(element.getAttribute('data-practice-notes')??'').split(/\s+/).filter(key=>keyPattern.test(key));
    if(!keys.length)continue;
    const attributes:[string,string][]=[];
    for(const a of element.attributes){
      if(geometry.has(a.name)&&!/[<>]|url\s*\(/i.test(a.value))attributes.push([a.name,a.value]);
      else if((a.name==='fill'||a.name==='stroke')&&/^(none|#[0-9a-f]{3,8})$/i.test(a.value))attributes.push([a.name,a.value]);
    }
    result.push({tag:element.localName,keys,attributes,part:element.getAttribute('class')??''});
  }
  return result;
}

// Shared chord stems cannot show two pitch results at once. Keep noteheads
// independent; use amber for a partly completed/mixed chord on the shared stem.
export function sharedInk(markers:(Marker|undefined)[]):Marker|undefined{
  const known=markers.filter((m):m is Marker=>!!m);if(!known.length)return;
  const held=known.some(m=>m.held),error=known.find(m=>m.kind==='miss'||m.kind==='wrong');
  if(error)return {...error,held};
  const kind=known[0].kind;
  if(known.length===markers.length&&known.every(m=>m.kind===kind))return{...known[0],held};
  if(known.every(m=>m.kind==='current'||m.kind==='playback'))return{...known[0],held};
  return{kind:'timing',symbol:'•',label:'Hợp âm có trạng thái từng nốt khác nhau',held};
}
