// Offline oracle bundle only; not imported or packaged by Pianist.
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge';
import {verifySource,type SourceAnalysis} from '../../../packages/exercise-generator/source-verification';
import {unzipSync,strFromU8} from '../../../apps/pianist-web/node_modules/fflate';
function inspect(input:{bytes:number[];name:string;analysis:SourceAnalysis;notationOracle?:boolean}){
  const bridge=new EngineBridge((window as any).pianist as NativeApi);
  const snapshot=bridge.semantics(new Uint8Array(input.bytes),input.name);
  const verification=verifySource(input.analysis,snapshot);
  let notation;
  if(input.notationOracle){
    const zip=unzipSync(bridge.prepare(new Uint8Array(input.bytes),input.name));
    const file=Object.keys(zip).find(name=>name.endsWith('.mscx'));
    if(!file)throw Error('No native MSCX in prepared archive');
    const document=new DOMParser().parseFromString(strFromU8(zip[file]),'application/xml');
    const score=document.querySelector('museScore > Score')!;
    const staves=[...score.children].filter(e=>e.tagName==='Staff');
    notation={clefs:staves.flatMap((staff,s)=>[...staff.children].filter(e=>e.tagName==='Measure')
      .flatMap((measure,m)=>[...measure.querySelectorAll('Clef')].map(c=>[s,m,c.querySelector('concertClefType')?.textContent]))),
      ottavas:[...score.querySelectorAll('Ottava > subtype')].map(o=>o.textContent)};
  }
  return {snapshot,verification,notation};
}
(window as any).q2Lab={inspect};
