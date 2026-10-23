import test from 'node:test';
import assert from 'node:assert/strict';
import {MidiRouter} from '../src/platform/midi-v2';

test('MIDI permission is shared; repeated connection keeps one device listener and release retains the port',async(t)=>{
  let permissions=0, opens=0, closes=0;
  const port={id:'p',name:'Test piano',state:'connected',onmidimessage:null as any,open:async()=>{opens++;},close:async()=>{closes++;}};
  const access={inputs:new Map([['p',port]]),onstatechange:()=>{}};
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'), secure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{requestMIDIAccess:async()=>{permissions++;return access;}}});
  Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});
  t.after(()=>{if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete (globalThis as any).navigator;if(secure)Object.defineProperty(globalThis,'isSecureContext',secure);else delete (globalThis as any).isSecureContext;});
  const router=new MidiRouter();await Promise.all([router.connect(),router.connect()]);
  const listener=port.onmidimessage;router.release();await router.connect();
  assert.equal(permissions,1);assert.equal(opens,1);assert.equal(closes,0);assert.equal(port.onmidimessage,listener);
  assert.equal(router.deviceId,'p');
  port.state='disconnected';access.onstatechange();
  assert.equal(router.connection,'disconnected');assert.equal(router.deviceId,'virtual');assert.equal(port.onmidimessage,null);
});
test('a slow device open cannot replace a newer chosen MIDI port',async()=>{
  let finish!:()=>void;
  const a={id:'a',name:'A',state:'connected',onmidimessage:null,open:()=>new Promise<void>(r=>finish=r),close:async()=>{}};
  const b={id:'b',name:'B',state:'connected',onmidimessage:null,open:async()=>{},close:async()=>{}};
  const router=new MidiRouter();(router as any).access={inputs:new Map([['a',a],['b',b]])};
  const old=router.select('a');await router.select('b');finish();await old;
  assert.equal(router.deviceId,'b');assert.equal(a.onmidimessage,null);assert.equal(typeof b.onmidimessage,'function');
});
