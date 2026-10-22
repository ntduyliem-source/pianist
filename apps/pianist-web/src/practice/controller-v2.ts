import {ENGINE_ID,type AttemptStatus,type EngineView,type MidiEvent,type ReplayCommand,type Timeline,type AttemptResult} from '../../../../packages/practice-engine-v2/model';
import {resultFor} from '../../../../packages/practice-engine-v2/results';
import {AudioClock} from '../platform/audio-clock-v2';

export class PracticeController {
  readonly transport=new AudioClock();readonly commands:ReplayCommand[]=[];
  status:AttemptStatus='ready';message='';elapsedMs=0;replayComplete=true;
  view:EngineView={judgements:[],extras:[],held:[],pedal:false,intervals:[],group:0,done:false,processedMs:0,faults:[]};
  onChange=()=>{};onComplete:(r:AttemptResult)=>void=()=>{};
  private worker?:Worker;private generation=crypto.randomUUID();private timer?:number;private resumeAt=0;private resuming=false;
  private ready?:()=>void;private closed?:(v:EngineView)=>void;private rejectReady?:(e:Error)=>void;private rejectClose?:(e:Error)=>void;
  private finishing=false;
  private finishOperation?:Promise<void>;
  private disposed=false;
  private lastPaint=0;
  private lastTick=0;
  private clockSegments:NonNullable<AttemptResult['clock']>['segments']=[];
  private lastClockCheck=0;
  constructor(readonly timeline:Timeline,readonly title:string){}
  private log(command:ReplayCommand){
    if(this.commands.length<400000)this.commands.push(structuredClone(command));else this.replayComplete=false;
    this.worker?.postMessage({type:'command',generation:this.generation,command});
  }
  private async load(){
    this.worker=new Worker(new URL('../../../../packages/practice-worker-v2/worker.ts',import.meta.url),{type:'module'});
    this.worker.onerror=e=>{const error=Error(e.message||'Worker luyện tập dừng đột ngột.');this.rejectReady?.(error);this.rejectClose?.(error);this.pause(error.message,true);};
    this.worker.onmessage=({data})=>{
      if(data.generation!==this.generation)return;
      if(data.type==='failure'){const error=Error(data.message);this.rejectReady?.(error);this.rejectClose?.(error);this.pause(error.message,true);return;}
      const incoming=data.view as EngineView;
      this.view={...incoming,judgements:[...this.view.judgements,...incoming.judgements],extras:[...this.view.extras,...incoming.extras],intervals:incoming.intervals.length?incoming.intervals:this.view.intervals,
        pedalIntervals:incoming.pedalIntervals?.length?incoming.pedalIntervals:this.view.pedalIntervals,controls:incoming.controls?.length?incoming.controls:this.view.controls};
      this.ready?.();this.ready=undefined;this.rejectReady=undefined;
      if(data.type==='closed'){this.closed?.(this.view);this.closed=undefined;return;}
      this.onChange();
      if(incoming.faults.length&&!this.finishing)void this.finish('interrupted');
      else if(incoming.done&&!this.finishing)void this.finish('complete');
    };
    await new Promise<void>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(Error('Worker chưa khởi động được.')),10000);
      this.ready=()=>{clearTimeout(timeout);resolve();};this.rejectReady=e=>{clearTimeout(timeout);reject(e);};
      this.worker!.postMessage({type:'load',generation:this.generation,timeline:this.timeline});
    });
  }
  async start(state:()=>MidiEvent[]){
    if(this.status!=='ready')return;this.status='counting';this.onChange();
    try{await this.load();if(this.disposed||this.finishing||this.status!=='counting')return;await this.begin(state,false);}
    catch(e){if(this.disposed||this.finishing||(this.status as AttemptStatus)==='finished')return;this.dispose();throw e;}
  }
  private async begin(state:()=>MidiEvent[],resuming:boolean){
    this.resuming=resuming;await this.transport.start(this.timeline,this.resumeAt);
    if(this.disposed||this.finishing||this.status==='finished'){this.transport.silence();return;}
    this.clockSegments.push(this.transport.mapping);this.lastClockCheck=performance.now();
    if(resuming)this.log({type:'boundary',atMs:this.resumeAt,kind:'resume'});
    this.status='counting';this.message='';
    this.lastTick=performance.now();
    for(const e of state())this.input(e);
    this.timer=window.setInterval(()=>this.tick(),20);this.tick();
  }
  private tick(){
    if(!['counting','running'].includes(this.status))return;
    const wallNow=performance.now();
    if(wallNow-this.lastTick>250){this.pause('Trình duyệt trễ quá lịch âm thanh. Tiếp tục sẽ phát lại từ trước đoạn gián đoạn.',true,Math.max(this.resumeAt,this.transport.at(this.lastTick)));return;}
    this.lastTick=wallNow;
    if(wallNow-this.lastClockCheck>=1000){this.lastClockCheck=wallNow;if(!this.transport.coherent()){this.pause('Đồng hồ đầu ra âm thanh đã thay đổi. Đếm vào lại trước khi tập tiếp.',true);return;}}
    const now=this.transport.now;
    if(this.transport.context?.state!=='running'){this.pause('Âm thanh bị ngắt. Bấm Tiếp tục để đếm vào lại.',true);return;}
    if(now>=this.resumeAt)this.status='running';
    this.elapsedMs=Math.max(this.resumeAt,now);this.transport.pump();
    if(!this.resuming||now>=this.resumeAt)this.log({type:'clock',atMs:now});
    if(performance.now()-this.lastPaint>=80){this.lastPaint=performance.now();this.onChange();}
  }
  input(event:MidiEvent){
    if(!['counting','running'].includes(this.status)||!this.transport.context||!this.transport.mapping.originPerformanceMs)return;
    if(this.transport.context.state!=='running'){this.pause('Đồng hồ âm thanh bị ngắt.',true);return;}
    this.transport.monitor(event);
    const e={...event,timestampMs:this.transport.at(event.timestampMs),receivedMs:this.transport.at(event.receivedMs)};
    if(this.resuming&&e.timestampMs<this.resumeAt){e.timestampMs=this.resumeAt;e.receivedMs=Math.max(e.receivedMs,this.resumeAt);e.stateOnly=true;}
    this.log({type:'input',event:e});
  }
  pause(message='Đã tạm dừng. Tiếp tục sẽ đếm vào lại.',interrupted=false,atMs?:number){
    if(!['counting','running'].includes(this.status)||this.finishing)return;
    clearInterval(this.timer);this.resumeAt=Math.max(this.resumeAt,atMs??this.transport.now);this.elapsedMs=this.resumeAt;
    this.log({type:'boundary',atMs:this.resumeAt,kind:'pause'});this.transport.silence();
    this.status=interrupted?'interrupted':'paused';this.message=message;this.onChange();
  }
  async resume(state:()=>MidiEvent[]){if(!['paused','interrupted'].includes(this.status))return;if(this.view.faults.length)throw Error('Lượt có lỗi giao MIDI; kết thúc lượt rồi bắt đầu lại.');await this.begin(state,true);}
  finish(outcome:AttemptResult['outcome']='aborted'):Promise<void>{
    if(this.finishOperation)return this.finishOperation;
    if(this.status==='finished'||!this.worker)return Promise.resolve();
    this.finishing=true;
    // Stop/restart must wait for an in-flight automatic completion as well.
    // The first caller owns the outcome and the single persisted result.
    this.finishOperation=this.closeAttempt(outcome).finally(()=>{this.finishing=false;this.finishOperation=undefined;});
    return this.finishOperation;
  }
  private async closeAttempt(outcome:AttemptResult['outcome']){
    clearInterval(this.timer);
    const elapsed=['counting','running'].includes(this.status)?Math.max(this.resumeAt,this.transport.now):this.elapsedMs;
    this.log({type:'boundary',atMs:elapsed,kind:'stop'});this.transport.silence();
    try{
      const view=await new Promise<EngineView>((resolve,reject)=>{
        const timeout=window.setTimeout(()=>reject(Error('Không nhận được kết quả từ Worker.')),5000);
        this.closed=v=>{clearTimeout(timeout);resolve(v);};this.rejectClose=e=>{clearTimeout(timeout);reject(e);};
        this.worker!.postMessage({type:'close',generation:this.generation});
      });
      const result=resultFor(this.timeline,view,this.title,outcome,Math.max(0,elapsed));
      result.clock={segments:this.clockSegments};
      if(this.replayComplete)result.replay={engine:ENGINE_ID,commands:this.commands};
      this.status='finished';this.worker?.terminate();this.worker=undefined;this.onChange();this.onComplete(result);
    }catch(e){this.status='interrupted';this.message=String(e);this.onChange();}
  }
  dispose(){this.disposed=true;clearInterval(this.timer);this.rejectReady?.(new DOMException('Đã hủy lượt tập.','AbortError'));this.rejectReady=undefined;this.ready=undefined;this.worker?.terminate();this.worker=undefined;void this.transport.dispose();this.status='finished';}
}
