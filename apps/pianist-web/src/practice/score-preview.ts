import type {Timeline} from '../../../../packages/practice-engine-v2/model';
import {AudioClock} from '../platform/audio-clock-v2';

// Listen-only playback uses the production audio clock, never a scoring Worker.
export class ScorePreview {
  readonly clock=new AudioClock();
  private timer?:number;private disposed=false;
  onPosition=(ms:number)=>{};onStop=()=>{};
  async start(t:Timeline){
    const audible={...t,settings:{...t.settings,mode:'bpm' as const,countIn:0,metronome:false},guide:[...t.targets,...t.guide].sort((a,b)=>a.atMs-b.atMs)};
    try{await this.clock.start(audible);}catch(error){if(this.disposed)return;throw error;}
    if(this.disposed){await this.clock.dispose();return;}
    this.timer=window.setInterval(()=>{
      if(this.clock.context?.state!=='running'||this.clock.now>=t.durationMs){this.stop();return;}
      this.clock.pump();this.onPosition(Math.max(0,this.clock.now));
    },40);
  }
  stop(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);void this.clock.dispose();this.onStop();}
}
