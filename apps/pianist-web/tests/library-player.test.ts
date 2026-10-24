import test from 'node:test';
import assert from 'node:assert/strict';
import {LibraryPlayer, type LibraryTrack} from '../src/application/library-player';
import type {EngineBridge} from '../../../packages/engine-bridge';
import {groupProjects} from '../src/features/library/project-versions';
import type {ProjectRecord} from '../src/platform/storage';
const track = (id:string):LibraryTrack => ({id,title:id,version:'1',load:async()=>({bytes:Uint8Array.of(1),filename:id+'.mxl'})});
const turn = () => new Promise<void>(resolve=>setTimeout(resolve,0));

test('Stop while native boots invalidates the pending library load before it can start audio', async()=>{
  let finish!:(bridge:EngineBridge)=>void, restores=0;
  const player = new LibraryPlayer({prepare:()=>new Promise(resolve=>finish=resolve),restore:()=>{restores++;}});
  const pending = player.play(track('a')); await turn();
  player.stop(); finish({auditionState(){throw Error('stale engine must not be touched');}} as unknown as EngineBridge);
  await pending;
  assert.equal(restores,1);assert.equal(player.snapshot().track,undefined);
  assert.equal(player.snapshot().error,'');
});
test('a stale rejected preparation cannot close the newer library track', async()=>{
  let rejectOld!:(reason:Error)=>void, resolveNew!:(bridge:EngineBridge)=>void, count=0, restores=0;
  const player = new LibraryPlayer({prepare:()=>++count===1 ? new Promise((_,reject)=>rejectOld=reject) : new Promise(resolve=>resolveNew=resolve),restore:()=>{restores++;}});
  const first=player.play(track('a'));await turn();
  const second=player.play(track('b'));await turn();
  rejectOld(Error('old request failed'));await first;
  assert.equal(player.snapshot().track?.id,'b'); assert.equal(player.snapshot().loading,true); assert.equal(restores,1);
  player.stop();resolveNew({} as EngineBridge);await second;
  assert.equal(restores,2);assert.equal(player.snapshot().track,undefined);
});
test('equal titles stay separate until explicitly grouped; saved version numbers survive gaps',()=>{
  const project=(id:string,more:Partial<ProjectRecord>={}):ProjectRecord=>({id,title:'Cùng tên',filename:id+'.mscz',bytes:Uint8Array.of(1),revision:1,createdAt:1,updatedAt:1,...more});
  assert.equal(groupProjects([project('a'),project('b')]).length,2);
  const work=groupProjects([project('b',{workId:'a',version:4}),project('a',{version:1})])[0];
  assert.deepEqual(work.versions.map(p=>p.version),[1,4]);
  assert.equal(groupProjects([project('b',{workId:'a',version:4})])[0].versions[0].version,4);
});

test('interruption during prepared playback keeps the song and pauses instead of closing it', async()=>{
  let paused=0, restored=0;
  const preview:any={onChange(){},onError(){},async start(){this.onChange({preparing:true,status:'stopped',positionMs:1200});},pause(){paused++;},stop(){},toggle(){},seek(){},speed(){},loop(){}};
  const bridge={semantics:()=>({occurrences:[{endMs:4000}]})} as unknown as EngineBridge;
  const player=new LibraryPlayer({prepare:async()=>bridge,restore:()=>{restored++;},audition:()=>preview});
  await player.play(track('a'));assert.equal(player.snapshot().loading,true);
  player.pause();assert.equal(paused,1);assert.equal(restored,0);
  assert.equal(player.snapshot().track?.id,'a');assert.equal(player.snapshot().positionMs,1200);
  player.stop();assert.equal(restored,1);
});
