import type {PracticeController} from './controller-v2';
import type {MidiRouter} from '../platform/midi-v2';
// Explicit diagnostics-only MIDI producer. It never calls a matcher or writes
// judgements: all bytes enter the same router/controller/Worker as a keyboard.
export function simulateMidi(controller:PracticeController,router:MidiRouter,deltaMs:number){
  if(router.deviceId!=='virtual')throw Error('Chọn bàn phím ảo trước khi mô phỏng.');
  const events=controller.timeline.targets.flatMap(n=>[
    {at:n.atMs+deltaMs+controller.timeline.settings.offsetMs,bytes:[0x90,n.pitch,90]},
    {at:n.atMs+deltaMs+controller.timeline.settings.offsetMs+20,bytes:[0x80,n.pitch,0]}]).sort((a,b)=>a.at-b.at);
  let next=0;
  const timer=window.setInterval(()=>{
    if(!['counting','running'].includes(controller.status)){clearInterval(timer);return;}
    const at=controller.transport.now;
    while(next<events.length&&events[next].at<=at){const e=events[next++];router.receive(e.bytes,controller.transport.performanceAt(e.at));}
    if(next===events.length)clearInterval(timer);
  },10);
  return()=>clearInterval(timer);
}
