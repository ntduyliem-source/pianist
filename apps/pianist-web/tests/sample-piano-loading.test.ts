import test from 'node:test';
import assert from 'node:assert/strict';
import {SamplePiano} from '../src/platform/sample-piano';
const turn=()=>new Promise(r=>setTimeout(r,0));

test('overlapping prepare calls both wait for samples; neither reports silent ready', async()=>{
 let loaded!:()=>void, created=0;
 class Instrument {constructor(){created++;} toDestination(){} load(){return new Promise<void>(r=>loaded=r);} disconnect(){} dispose(){} stopAll(){}}
 Object.assign(globalThis,{location:{href:'http://localhost/'}});
 const piano=new SamplePiano(async()=>({piano:Instrument,context:{},tone:{}} as any),async()=>{});
 let one=false,two=false;
 const a=piano.prepare([0]).then(()=>one=true);await turn();
 const b=piano.prepare([0]).then(()=>two=true);await turn();
 assert.equal(created,1);assert.equal(one,false);assert.equal(two,false);
 loaded();await Promise.all([a,b]);assert.equal(one,true);assert.equal(two,true);piano.dispose();
});

test('dispose during runtime loading prevents a late instrument from reviving the cancelled player',async()=>{
 let runtime!:(value:any)=>void,created=0;
 class Instrument {constructor(){created++;}}
 const piano=new SamplePiano(()=>new Promise(r=>runtime=r),async()=>{});
 const pending=piano.prepare([0]);piano.dispose();runtime({piano:Instrument,context:{},tone:{}});
 await assert.rejects(pending,{name:'AbortError'});assert.equal(created,0);
});
