import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {offsetMatches,pedalMetrics} from '../../../packages/practice-engine-v2/upstream/mir-eval';
import {applySustain} from '../../../packages/practice-engine-v2/upstream/note-seq';

test('R4 differential oracle: original mir_eval Python and whole Magenta sustain function',()=>{
  const cases:any[]=[];let seed=0x52a4;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const start of [0,.123456,12.6,3600])for(const duration of [.05,.1,.25,.5,1,4]){
    const end=start+duration,tolerance=Math.max(.05,duration*.2);
    for(const delta of [-tolerance-.00006,-tolerance,-tolerance+.00006,0,tolerance-.00006,tolerance,tolerance+.00006])cases.push({kind:'offset',ref:[start,end],end:end+delta});
  }
  cases.push({kind:'pedal',ref:[],est:[]},{kind:'pedal',ref:[[0,1]],est:[]},{kind:'pedal',ref:[],est:[[0,1]]});
  for(let k=0;k<160;k++){
    const ref=Array.from({length:1+Math.floor(random()*12)},()=>{const start=Math.round(random()*20)/10;return [start,start+.1+random()*2];});
    const est=ref.filter(()=>random()>.2).map(([a,b])=>[Math.max(0,a+Math.round((random()-.5)*6)/10),b+Math.round((random()-.5)*6)/10]).filter(([a,b])=>b>a);
    if(k%2)est.push([.3,2]);cases.push({kind:'pedal',ref,est});
  }
  for(const value of [0,63,64,127])for(const time of [0,100,200,201,500,1000])cases.push({kind:'sustain',
    notes:[{id:'a',start:100,end:200,pitch:60,instrument:'a'},{id:'b',start:500,end:600,pitch:60,instrument:'a'},{id:'c',start:100,end:200,pitch:60,instrument:'b'}],
    controls:[{time,value,instrument:'a'},{time:1000,value:0,instrument:'a'}]});
  for(let k=0;k<180;k++){
    const notes=Array.from({length:1+Math.floor(random()*15)},(_,i)=>{const start=Math.floor(random()*10)*100;return{id:String(i),start,end:start+Math.floor(random()*6+1)*100,pitch:60+Math.floor(random()*3),instrument:random()<.5?'a':'b',...(i===0&&k%7===0?{drum:true}:{})};});
    const controls=Array.from({length:Math.floor(random()*12)},()=>({time:Math.floor(random()*15)*100,value:random()<.5?63:64,instrument:random()<.5?'a':'b'}));
    cases.push({kind:'sustain',notes,controls});
  }
  const oracle=spawnSync('python',['-X','utf8',fileURLToPath(new URL('../../../tests/reference-runners/r4/oracle.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(oracle.status,0,oracle.stderr);
  const expected=JSON.parse(oracle.stdout);
  const close=(actual:any,wanted:any,path:string)=>{
    if(typeof actual==='number'&&typeof wanted==='number')assert(Math.abs(actual-wanted)<1e-10,`${path}: ${actual} != ${wanted}`);
    else if(actual&&typeof actual==='object'){assert.deepEqual(Object.keys(actual).sort(),Object.keys(wanted).sort(),path);for(const key of Object.keys(actual))close(actual[key],wanted[key],path+'.'+key);}
    else assert.equal(actual,wanted,path);
  };
  cases.forEach((c,i)=>close(c.kind==='offset'?offsetMatches(c.ref,c.end):c.kind==='pedal'?pedalMetrics(c.ref,c.est):applySustain(c.notes,c.controls),expected[i],`case ${i} ${c.kind}`));
  assert.equal(cases.length,535);
});
