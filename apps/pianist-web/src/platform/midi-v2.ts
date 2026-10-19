import type {MidiEvent} from '../../../../packages/practice-engine-v2/model';

type Port = {id:string;name:string;state:string;onmidimessage:((e:{data:Uint8Array;timeStamp:number})=>void)|null;open():Promise<unknown>;close():Promise<unknown>};
export const noteName=(n:number)=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);

// Device/packet adapter only. CC and NoteOn-zero semantics follow MIDI 1.0;
// all scoring is in the Worker. Held physical keys survive a session boundary
// as state-only events, so resetting app voices never invents a new attack.
export class MidiRouter {
  private access:any; private selected?:Port; private serial=0;
  private keys=new Map<string,MidiEvent>();private pedals=new Map<string,MidiEvent>();
  private listeners=new Set<(e:MidiEvent)=>void>();
  deviceId='virtual';ports:{id:string;name:string}[]=[];
  onChange=()=>{};onDisconnect=()=>{};onReset=()=>{};
  onInput: (e:MidiEvent,bytes:number[])=>void=()=>{};
  subscribe=(fn:(e:MidiEvent)=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  get pedal(){return this.pedals.size>0;}
  heldPitches(){return [...new Set([...this.keys.values()].map(e=>e.pitch))];}
  heldNotes():readonly MidiEvent[]{return [...this.keys.values()];}
  async connect(autoSelect=true){
    const nav=navigator as Navigator&{requestMIDIAccess?:(o:{sysex:boolean})=>Promise<unknown>};
    if(!isSecureContext||!nav.requestMIDIAccess)throw Error('MIDI cần Chrome/Edge trên HTTPS hoặc localhost.');
    try{this.access??=await nav.requestMIDIAccess({sysex:false});}catch{throw Error('Chưa được cấp quyền MIDI. Cho phép MIDI trong cài đặt trang rồi kết nối lại.');}
    this.access.onstatechange=()=>this.refresh();this.refresh();
    if(autoSelect&&this.ports.length===1)await this.select(this.ports[0].id);
    if(!this.ports.length)throw Error('Chưa có đàn MIDI. Có thể kiểm tra bằng bàn phím ảo.');
  }
  private refresh(){
    this.ports=[...this.access.inputs.values()].filter((p:Port)=>p.state==='connected').map((p:Port)=>({id:p.id,name:p.name||'MIDI'}));
    if(this.selected&&!this.ports.some(p=>p.id===this.selected!.id)){
      this.release();this.keys.clear();this.pedals.clear();this.selected.onmidimessage=null;this.selected=undefined;this.deviceId='virtual';this.onDisconnect();
    }this.onChange();
  }
  async select(id:string){
    if(id===this.deviceId)return;
    this.release();this.keys.clear();this.pedals.clear();if(this.selected){this.selected.onmidimessage=null;await this.selected.close();}
    this.selected=undefined;this.deviceId='virtual';
    if(id!=='virtual'){
      const p=this.access?.inputs.get(id) as Port|undefined;
      if(!p||p.state!=='connected')throw Error('Đàn đã ngắt kết nối.');
      await p.open();this.selected=p;this.deviceId=p.id;
      p.onmidimessage=e=>this.receive([...e.data],e.timeStamp,p.id,'midi');
    }this.onChange();
  }
  receive(bytes:number[],stamp:number,portId='virtual',source:MidiEvent['source']='virtual',synthetic=false){
    if(portId!==this.deviceId||(source==='virtual')!==(this.deviceId==='virtual')||bytes.length<3)return;
    const [status,pitch,value]=bytes,op=status>>4;
    if(![status,pitch,value].every(Number.isInteger)||status<128||status>239||pitch<0||pitch>127||value<0||value>127||!Number.isFinite(stamp))return;
    if(![8,9,11].includes(op)||op===11&&![64,120,123].includes(pitch))return;
    const channel=status&15,kind:MidiEvent['kind']=op===11?'pedal':op===8||value===0?'off':'on';
    if(op===11&&pitch!==64){this.release(channel);for(const [key,e] of this.keys)if(e.channel===channel)this.keys.delete(key);this.pedals.delete(String(channel));this.onReset();return;}
    const e:MidiEvent={sequence:++this.serial,kind,pitch,value,channel,portId,source,timestampMs:stamp>1e12?stamp-performance.timeOrigin:stamp,receivedMs:performance.now(),...(synthetic?{synthetic:true}:{})};
    const key=`${channel}/${pitch}`;
    if(kind==='on'){if(this.keys.has(key))return;this.keys.set(key,e);}
    if(kind==='off')this.keys.delete(key);
    if(kind==='pedal'){if(value>=64)this.pedals.set(String(channel),e);else this.pedals.delete(String(channel));}
    this.onInput(e,kind==='off'?[0x80|channel,pitch,value]:bytes);this.listeners.forEach(fn=>fn(e));this.onChange();
  }
  virtual(pitch:number,on:boolean){this.receive([on?0x90:0x80,pitch,on?90:0],performance.now());}
  // Snapshot physical state without replaying past attacks. A new sequence is
  // required because each session deduplicates packet identities.
  stateEvents(now=performance.now()):MidiEvent[]{return [...this.pedals.values(),...this.keys.values()].map(e=>({...e,sequence:++this.serial,timestampMs:now,receivedMs:now,stateOnly:true}));}
  release(channel?:number){
    const physicalKeys=[...this.keys.entries()].filter(([,e])=>e.source==='midi'),physicalPedals=[...this.pedals.entries()].filter(([,e])=>e.source==='midi');
    for(const e of [...this.keys.values()])if(channel===undefined||e.channel===channel)this.receive([0x80|e.channel,e.pitch,0],performance.now(),e.portId,e.source,true);
    for(const e of [...this.pedals.values()])if(channel===undefined||e.channel===channel)this.receive([0xb0|e.channel,64,0],performance.now(),e.portId,e.source,true);
    for(const [k,e] of physicalKeys)this.keys.set(k,e);for(const [k,e] of physicalPedals)this.pedals.set(k,e);this.onChange();
  }
}
