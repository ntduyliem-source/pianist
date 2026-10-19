import type {Timeline,MidiEvent} from '../../../../packages/practice-engine-v2/model';

// One affine mapping from performance timestamps to Web Audio time per run.
// It never follows the player's tempo or silently adjusts calibration.
export class AudioClock {
  context?:AudioContext; private origin=0; private audioMinusPerf=0;
  private scheduled=new Set<number>();private nodes=new Set<AudioScheduledSourceNode>();
  private monitors=new Map<string,{osc:OscillatorNode;gain:GainNode;held:boolean;channel:number}>();
  private monitorPedals=new Set<number>();
  private timeline?:Timeline;private resumeAt=0;private count=0;
  private source:'output-timestamp'|'audio-current-time'='audio-current-time';
  get mapping(){return{originPerformanceMs:this.origin,audioMinusPerformanceSeconds:this.audioMinusPerf,source:this.source,resumeAtMs:this.resumeAt};}
  coherent(){
    if(!this.context)return false;
    const pair=this.context.getOutputTimestamp?.();
    const current=this.source==='output-timestamp'&&pair?.contextTime&&pair.performanceTime?pair.contextTime-pair.performanceTime/1000:this.context.currentTime-performance.now()/1000;
    return Math.abs(current-this.audioMinusPerf)<=.025;
  }
  get now(){return performance.now()-this.origin;}
  at(timestamp:number){return timestamp-this.origin;}
  performanceAt(positionMs:number){return this.origin+positionMs;}
  async start(timeline:Timeline,resumeAt=0){
    this.silence();this.context??=new AudioContext({latencyHint:'interactive'});await this.context.resume();
    if(this.context.state!=='running')throw Error('Chưa bật được âm thanh. Bấm Bắt đầu lại.');
    const ctx=this.context;let pair=ctx.getOutputTimestamp?.();
    // Web Audio returns zero timestamps before its first rendered block.
    // Wait for one 128-frame render quantum at the output before pinning the mapping;
    // sampling currentTime=0 here includes device startup delay in every beat.
    // https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-getoutputtimestamp
    const deadline=performance.now()+2000;
    while(typeof ctx.getOutputTimestamp==='function'&&(!pair?.contextTime||pair.contextTime<128/ctx.sampleRate||!pair.performanceTime)){
      if(this.context!==ctx||ctx.state!=='running')throw Error('Khởi động âm thanh đã bị ngắt. Bấm Bắt đầu lại.');
      if(performance.now()>=deadline)throw Error('Thiết bị âm thanh chưa cung cấp đồng hồ đầu ra. Bấm Bắt đầu lại.');
      await new Promise<void>(resolve=>setTimeout(resolve,10));pair=ctx.getOutputTimestamp();
    }
    if(this.context!==ctx||ctx.state!=='running')throw Error('Khởi động âm thanh đã bị ngắt. Bấm Bắt đầu lại.');
    this.timeline=timeline;this.resumeAt=resumeAt;this.count=timeline.settings.countIn;
    this.source=pair?.contextTime&&pair.performanceTime?'output-timestamp':'audio-current-time';
    this.audioMinusPerf=pair?.contextTime&&pair.performanceTime?pair.contextTime-pair.performanceTime/1000:ctx.currentTime-performance.now()/1000;
    this.origin=performance.now()+160+this.count*60000/timeline.settings.bpm-resumeAt;
    this.scheduled.clear();this.pump();
  }
  private audioTime(atMs:number){return (atMs+this.origin)/1000+this.audioMinusPerf;}
  private sound(atMs:number,durationMs:number,pitch:number,volume:number){
    const ctx=this.context!;const when=this.audioTime(atMs);if(when<ctx.currentTime-.01)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=440*Math.pow(2,(pitch-69)/12);osc.type='triangle';
    const start=Math.max(when,ctx.currentTime),end=start+Math.max(.02,durationMs/1000);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.005);gain.gain.exponentialRampToValueAtTime(.0001,end);
    osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(end+.02);this.nodes.add(osc);osc.onended=()=>{this.nodes.delete(osc);osc.disconnect();gain.disconnect();};
  }
  pump(){
    if(!this.timeline||!this.context)return;
    const t=this.timeline,now=this.now,horizon=now+250;
    const beats=t.settings.mode==='bpm'&&t.settings.metronome?t.clicks:[];
    for(let i=0;i<this.count;i++){
      const at=this.resumeAt-(this.count-i)*60000/t.settings.bpm,id=-1-i;
      if(at<=horizon&&!this.scheduled.has(id)){this.scheduled.add(id);this.sound(at,60,i===0?88:81,.12);}
    }
    // Binary-search the current audio horizon; long scores do not scan every note.
    const schedule=(items:{atMs:number}[],base:number,play:(i:number)=>void)=>{
      let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(items[mid].atMs<Math.max(this.resumeAt,now-100))lo=mid+1;else hi=mid;}
      for(let i=lo;i<items.length&&items[i].atMs<=horizon;i++)if(!this.scheduled.has(base+i)){this.scheduled.add(base+i);play(i);}
    };
    schedule(beats,0,i=>this.sound(beats[i].atMs,45,beats[i].accent?88:81,.09));
    schedule(t.guide,1000000,i=>this.sound(t.guide[i].atMs,t.guide[i].endMs-t.guide[i].atMs,t.guide[i].pitch,.035));
  }
  monitor(event:MidiEvent){
    if(event.source!=='virtual')return;
    if(event.kind==='pedal'){
      if(event.value>=64&&this.timeline?.settings.pedalEnabled!==false&&!event.synthetic)this.monitorPedals.add(event.channel);
      else{this.monitorPedals.delete(event.channel);for(const [key,n] of this.monitors)if(n.channel===event.channel&&!n.held)this.stopMonitor(key);}
    }else if(!event.stateOnly)this.tone(event.pitch,event.kind==='on',event.channel,!!event.synthetic);
  }
  private stopMonitor(key:string){
    const prior=this.monitors.get(key),ctx=this.context;if(!prior||!ctx)return;
    prior.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.015);prior.osc.stop(ctx.currentTime+.1);this.monitors.delete(key);
  }
  // Live voice adapter follows note-seq's sustain/re-strike event semantics.
  // The audible envelope below does not participate in duration assessment.
  tone(pitch:number,on:boolean,channel=0,force=false){
    const ctx=this.context;if(!ctx||ctx.state!=='running')return;
    const key=`${channel}/${pitch}`,prior=this.monitors.get(key);
    if(!on&&prior&&!force&&this.monitorPedals.has(channel)){prior.held=false;return;}
    this.stopMonitor(key);
    if(!on)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.value=440*2**((pitch-69)/12);gain.gain.value=.055;osc.connect(gain).connect(ctx.destination);osc.start();this.monitors.set(key,{osc,gain,held:true,channel});osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  silence(){for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();for(const key of this.monitors.keys())this.stopMonitor(key);this.monitorPedals.clear();this.timeline=undefined;}
  async dispose(){this.silence();await this.context?.close();this.context=undefined;}
}
