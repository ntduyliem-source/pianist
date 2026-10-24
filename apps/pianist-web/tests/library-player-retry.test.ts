import test from 'node:test';
import assert from 'node:assert/strict';
import {LibraryPlayer, type LibraryTrack} from '../src/application/library-player';
import type {EngineBridge} from '../../../packages/engine-bridge';
const song:LibraryTrack={id:'same',title:'Same song',version:'1',load:async()=>({bytes:Uint8Array.of(1),filename:'score.mxl'})};
const bridge={semantics:()=>({occurrences:[{endMs:4000}]})} as unknown as EngineBridge;

test('a pending preparation remains bounded even after start resolves; retry the SAME song gets a fresh audition', async()=>{
 let attempt=0, stopped=0;
 const player=new LibraryPlayer({preparationTimeoutMs:20,prepare:async()=>bridge,restore(){},audition:()=>{
   const pending=++attempt===1;
   return {range:{startMs:0,endMs:4000},onChange(_state:any){},onError(){},async start(){this.onChange({preparing:pending,status:pending?'stopped':'playing',positionMs:0} as any);},stop(){stopped++;},pause(){},async toggle(){throw Error('Must create a fresh audition after failed preparation');},seek(){},speed(){},loop(){}};
 }});
 await player.play(song);
 await new Promise(r=>setTimeout(r,40));
 assert.equal(player.snapshot().loading,false);assert.match(player.snapshot().error,/Thử lại/);assert.equal(stopped,1);
 await player.play(song);assert.equal(attempt,2);assert.equal(player.snapshot().status,'playing');assert.equal(player.snapshot().error,'');player.stop();
});

test('late callbacks from a cancelled song cannot turn the replacement back into loading',async()=>{
 const previews:any[]=[];
 const player=new LibraryPlayer({prepare:async()=>bridge,restore(){},audition:()=>{const p:any={onChange(){},onError(){},async start(){this.onChange({preparing:false,status:'playing',positionMs:0});},stop(){},pause(){},toggle(){},seek(){},speed(){},loop(){}};previews.push(p);return p;}});
 await player.play(song);player.stop();await player.play(song);
 previews[0].onChange({preparing:true,status:'stopped'});previews[0].onError(Error('Old failure'));
 assert.equal(player.snapshot().loading,false);assert.equal(player.snapshot().status,'playing');assert.equal(player.snapshot().error,'');player.stop();
});
