import React,{useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import type {ScoreSnapshot} from '../../../../packages/score-contracts';
import type {PracticeSettings,SavedAttempt,AttemptResult,EngineView} from '../../../../packages/practice-engine-v2/model';
import {createTimeline} from '../../../../packages/practice-engine-v2/score-adapter';
import {attemptCsv,canCompare,replayAttempt} from '../../../../packages/practice-engine-v2/results';
import {ManiaHitWindows} from '../../../../packages/practice-engine-v2/upstream/mania';
import {workspace as ws} from '../workspace';
import {download} from '../platform/files';
import {noteName} from '../platform/midi-v2';
import {PracticeController} from './controller-v2';
import {feedback} from './feedback-v2';
import {Sheet} from './Sheet';
import {CalibrationView} from './CalibrationView';
import {simulateMidi} from './midi-simulation-v2';

const run=(f:()=>unknown)=>()=>void ws.run(f);
const percent=(n:number|null)=>n===null?'—':(n*100).toFixed(1)+'%';
const date=(n:number)=>new Date(n).toLocaleString('vi');
const empty:EngineView={judgements:[],extras:[],held:[],pedal:false,intervals:[],group:0,done:false,processedMs:0,faults:[]};
const gradeText={perfect:'Perfect',great:'Great',good:'Good',ok:'OK',meh:'Meh',miss:'Miss'};

export function Practice({snapshot,config:c}:{snapshot:ScoreSnapshot;config:PracticeSettings}){
  useSyncExternalStore(ws.subscribe,ws.snapshot);
  const [,refresh]=useState(0),[zoom,setZoom]=useState(100),[scroll,setScroll]=useState(true),[selecting,setSelecting]=useState<'a'|'b'|null>(null),[keepReplay,setReplay]=useState(true);
  const session=ws.session,status=session?.status??'ready',active=!!session&&!['ready','finished'].includes(status);
  const parsed=useMemo(()=>{try{return{timeline:createTimeline(snapshot,c),error:''};}catch(e){return{timeline:undefined,error:String(e)};}},[snapshot,c]);
  const t=active?session!.timeline:parsed.timeline,view=active?session!.view:empty;
  const held=ws.midi.heldPitches(),position=active?session!.elapsedMs:0;
  const f=useMemo(()=>t?feedback(t,view,position,held):{markers:new Map(),currentAnchors:[],expected:[],visit:0},[t,view,position,held.join(',')]);
  const update=(patch:Partial<PracticeSettings>)=>{if(!active)ws.updatePracticeSettings(patch);};
  useEffect(()=>()=>{if(ws.session&&['ready','finished'].includes(ws.session.status)){ws.session.dispose();ws.session=undefined;}},[]);
  const start=async(simulationDelta?:number)=>{
    if(!t)throw Error(parsed.error);ws.session?.dispose();
    const s=ws.session=new PracticeController(t,snapshot.title);s.onChange=()=>{refresh(x=>x+1);ws.patch({});};
    s.onComplete=r=>{if(simulationDelta!==undefined)r.simulation={script:'native-targets-onset',deltaMs:simulationDelta};void ws.recordResult(r,keepReplay);};
    await s.start(()=>ws.midi.stateEvents());
    if(simulationDelta!==undefined)simulateMidi(s,ws.midi,simulationDelta);
  };
  const range=(index:number)=>{if(!selecting||active)return;update(selecting==='a'?{fromMeasure:index,toMeasure:Math.max(index,c.toMeasure)}:{toMeasure:index,fromMeasure:Math.min(index,c.fromMeasure)});setSelecting(null);};
  const windows=new ManiaHitWindows(c.difficulty).values;
  const latest=view.judgements.at(-1);
  return <main className="practice-page">
    <div className="practice-heading"><div className="practice-title"><div className="eyebrow">PIANO PRACTICE · CHỈ ĐỌC</div><h1 id="view-heading" tabIndex={-1}>{snapshot.title}</h1><p>Ô nhịp {c.fromMeasure+1}–{c.toMeasure+1} · {t?.targets.length??0} nốt · phiên bản {snapshot.revision}</p></div>
      <div className="mode-switch"><button disabled={active} className={c.mode==='wait'?'active':''} onClick={()=>update({mode:'wait'})}>Đúng nốt</button><button disabled={active} className={c.mode==='bpm'?'active':''} onClick={()=>update({mode:'bpm'})}>Theo BPM</button></div>
      <button disabled={active} onClick={run(()=>ws.openEditor())}>Về Editor</button><button disabled={active} onClick={()=>ws.openPractice()}>Đổi bài</button></div>
    <div className="practice-body">
      <aside className="practice-settings"><fieldset disabled={active&&!['paused','interrupted'].includes(status)}>
        <section className="settings-section"><h2 className="section-label">THIẾT BỊ</h2><button onClick={run(()=>ws.midi.connect())}>Kết nối MIDI</button><label>Đầu vào<select aria-label="Thiết bị MIDI" value={ws.midi.deviceId} onChange={e=>void ws.run(async()=>{await ws.midi.select(e.target.value);update({deviceId:ws.midi.deviceId,inputSource:ws.midi.deviceId==='virtual'?'virtual':'midi'});})}><option value="virtual">Bàn phím ảo</option>{ws.midi.ports.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></section></fieldset><fieldset disabled={active}>
        <section className="settings-section"><h2 className="section-label">NHỊP VÀ ĐOẠN TẬP</h2>
          <label>BPM<input aria-label="BPM" type="number" min={20} max={300} value={c.bpm} onChange={e=>update({bpm:+e.target.value})}/></label>
          <label>Đơn vị phách<select aria-label="Đơn vị phách" value={c.beatQuarter} onChange={e=>update({beatQuarter:+e.target.value as .5|1|1.5})}><option value={.5}>♪ · móc đơn</option><option value={1}>♩ · nốt đen</option><option value={1.5}>♩. · đen chấm dôi</option></select></label>
          <label>Tempo<select value={c.tempoMode} aria-label="Tempo" onChange={e=>update({tempoMode:e.target.value as 'fixed'|'score'})}><option value="fixed">Cố định theo BPM</option><option value="score">Giữ thay đổi tempo của bài</option></select></label>
          <div className="range-fields"><label>Từ ô<input aria-label="Từ ô nhịp" type="number" min={1} max={snapshot.measures.length} value={c.fromMeasure+1} onChange={e=>rangeEdit(+e.target.value-1,'a')}/></label><label>Đến ô<input aria-label="Đến ô nhịp" type="number" min={1} max={snapshot.measures.length} value={c.toMeasure+1} onChange={e=>rangeEdit(+e.target.value-1,'b')}/></label></div>
          <div className="button-row"><button aria-pressed={selecting==='a'} onClick={()=>setSelecting(selecting==='a'?null:'a')}>Chọn A trên bài</button><button aria-pressed={selecting==='b'} onClick={()=>setSelecting(selecting==='b'?null:'b')}>Chọn B trên bài</button></div>
          <label>Số vòng<input aria-label="Số vòng" type="number" min={1} max={10} value={c.loops} onChange={e=>update({loops:+e.target.value})}/></label><label>Tăng BPM mỗi vòng<input type="number" min={0} max={50} value={c.loopBpmStep} onChange={e=>update({loopBpmStep:+e.target.value})}/></label>
          <label>Đếm vào · phách<input aria-label="Đếm vào" type="number" min={0} max={16} value={c.countIn} onChange={e=>update({countIn:+e.target.value})}/></label><label><input type="checkbox" checked={c.metronome} onChange={e=>update({metronome:e.target.checked})}/>Metronome</label>
        </section>
        <section className="settings-section"><h2 className="section-label">TAY VÀ BÈ</h2><select aria-label="Tay tập" value={c.hand} onChange={e=>update({hand:e.target.value as PracticeSettings['hand']})}><option value="both">Hai tay</option><option value="right">Tay phải</option><option value="left">Tay trái</option></select>
          {snapshot.staves.map(s=><label key={s.id}>Khuông {s.id+1} · {s.part}<select value={c.roles[s.id]} onChange={e=>update({roles:{...c.roles,[s.id]:e.target.value as 'left'|'right'|'off'}})}><option value="right">Tay phải</option><option value="left">Tay trái</option><option value="off">Bỏ qua</option></select></label>)}
          <div className="button-row">{[0,1,2,3].map(v=><label key={v}><input type="checkbox" checked={c.voices.includes(v)} onChange={e=>update({voices:e.target.checked?[...c.voices,v].sort():c.voices.filter(x=>x!==v)})}/>Bè {v+1}</label>)}</div>
          <label><input type="checkbox" checked={c.accompaniment} onChange={e=>update({accompaniment:e.target.checked})}/>Phát tay còn lại · BPM</label></section>
        <section className="settings-section"><h2 className="section-label">ĐO THỜI GIAN</h2><label>Cửa sổ osu!mania<select aria-label="Độ khó timing" value={c.difficulty} onChange={e=>update({difficulty:+e.target.value})}><option value={0}>OD 0 · rộng</option><option value={5}>OD 5 · chuẩn</option><option value={10}>OD 10 · chặt</option></select></label>
          <p className="field-help">Perfect ±{windows.perfect} ms · Great ±{windows.great} ms · nhận nốt tối đa ±{windows.meh} ms.</p>
          <label>Bù trễ đầu vào · ms<input aria-label="Bù trễ ms" type="number" min={-500} max={500} value={c.offsetMs} onChange={e=>update({offsetMs:+e.target.value})}/></label><p className="field-help">Giá trị dương trừ khỏi timestamp bấm phím. Không tự đổi trong lượt tập.</p>
          <CalibrationView settings={c} onApply={offsetMs=>update({offsetMs})}/>
          <label><input type="checkbox" checked={keepReplay} onChange={e=>setReplay(e.target.checked)}/>Lưu MIDI để replay kiểm chứng</label>
        </section>
      </fieldset><section className="settings-section practice-policy"><strong>{c.mode==='wait'?'Đủ nốt mới chuyển':'Giữ nhịp theo lịch cố định'}</strong><p>{c.mode==='wait'?'Ghi nhớ từng nốt đã đánh trong hợp âm; không cần giữ đồng thời. Không chấm timing.':'Chấm riêng từng lần bấm. Không bù nhịp theo người chơi. Input thừa được báo riêng, không bị trừ vào accuracy osu!.'}</p><p>Pedal và thời gian giữ phím chỉ được ghi lại. Chưa chấm trường độ, arpeggio hoặc diễn cảm piano.</p></section></aside>
      <section className="practice-stage">
        <div className="transport">{!active?<button className="primary start-button" disabled={!t} onClick={run(()=>start())}>▶ Bắt đầu</button>:['paused','interrupted'].includes(status)?<button className="primary" disabled={ws.midi.deviceId!==c.deviceId} onClick={run(()=>session!.resume(()=>ws.midi.stateEvents()))}>▶ Tiếp tục</button>:<button onClick={()=>session!.pause()}>Ⅱ Tạm dừng</button>}
          <button disabled={!active} onClick={run(()=>session!.finish())}>Kết thúc lượt</button><span role="status">{status==='counting'?`Đếm vào ${Math.max(1,Math.ceil((session!.timeline.settings.countIn?Math.max(0,-session!.transport.now):0)/ (60000/c.bpm)))}`:status==='running'?'Đang tập':status==='ready'?'Sẵn sàng':session?.message||status}</span>
          <span className="transport-time">{Math.floor(Math.max(0,position)/1000)} s · {view.judgements.length}/{t?.targets.length??0} nốt</span></div>
        {parsed.error&&<p role="alert" className="policy-warning">{parsed.error}</p>}
        {new URLSearchParams(location.search).has('diagnostics')&&<div className="policy-warning"><button disabled={active||c.mode!=='bpm'||ws.midi.deviceId!=='virtual'||!t} onClick={run(()=>start(-120))}>MIDI mô phỏng −120 ms</button><span>Lượt kiểm từ snapshot native, được gắn nhãn mô phỏng và không so với lượt người chơi.</span></div>}
        {!!snapshot.warnings.length&&<p className="policy-warning">Ký hiệu cần lưu ý: {snapshot.warnings.join(', ')}. Lượt này chỉ chấm onset của nốt viết; không mở rộng ornament hoặc rải hợp âm.</p>}
        <div className="sheet-toolbar"><span>{selecting?`Bấm ô nhịp để chọn ${selecting.toUpperCase()}`:'Bản nhạc chỉ đọc'}</span><label><input type="checkbox" checked={scroll} onChange={e=>setScroll(e.target.checked)}/>Tự cuộn</label><label>Thu phóng<select value={zoom} onChange={e=>setZoom(+e.target.value)}>{[60,80,100,120,150].map(n=><option key={n} value={n}>{n}%</option>)}</select></label></div>
        <Sheet snapshot={snapshot} markers={f.markers} currentAnchors={f.currentAnchors} zoom={zoom} autoScroll={scroll} fromMeasure={c.fromMeasure} toMeasure={c.toMeasure} selecting={selecting} onMeasure={range}/>
        <div className="live-feedback"><div className="feedback-main"><strong>{latest?c.mode==='wait'?'Đã nhận đúng nốt':`${gradeText[latest.grade]} · ${latest.delta>0?'+':''}${Math.round(latest.delta)} ms`:'Bấm phím để xem trạng thái nhận MIDI'}</strong></div><span>{view.extras.length} input thừa</span><span>{view.judgements.filter(j=>j.grade==='miss').length} miss</span></div>
        <Piano held={held} expected={f.expected}/>
      </section></div>
  </main>;
  function rangeEdit(value:number,side:'a'|'b'){const n=Math.max(0,Math.min(snapshot.measures.length-1,value));update(side==='a'?{fromMeasure:n,toMeasure:Math.max(n,c.toMeasure)}:{toMeasure:n,fromMeasure:Math.min(n,c.fromMeasure)});}
}

function Piano({held,expected}:{held:number[];expected:number[]}){
  const [octave,setOctave]=useState(4);const from=Math.min(92,octave*12);
  const notes=Array.from({length:36},(_,i)=>from+i),black=(n:number)=>[1,3,6,8,10].includes(n%12),white=notes.filter(n=>!black(n));
  const keys=['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';'];
  useEffect(()=>{
    const pressed=new Map<string,number>();
    const down=(e:KeyboardEvent)=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||(e.target as HTMLElement).closest('input,select,textarea'))return;const i=keys.indexOf(e.key.toLowerCase());if(i<0)return;e.preventDefault();pressed.set(e.code,from+12+i);ws.midi.virtual(from+12+i,true);};
    const up=(e:KeyboardEvent)=>{const n=pressed.get(e.code);if(n!==undefined){ws.midi.virtual(n,false);pressed.delete(e.code);}};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);for(const n of pressed.values())ws.midi.virtual(n,false);};
  },[octave]);
  const button=(n:number)=>({key:n,'aria-label':noteName(n),'aria-pressed':held.includes(n),disabled:ws.midi.deviceId!=='virtual',onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);ws.midi.virtual(n,true);},onPointerUp:()=>ws.midi.virtual(n,false),onPointerCancel:()=>ws.midi.virtual(n,false),onLostPointerCapture:()=>ws.midi.virtual(n,false)});
  return <div className="piano-panel"><div className="piano-caption"><span>Bàn phím MIDI {held.map(noteName).join(' · ')}</span><span className={ws.midi.pedal?'pedal active':'pedal'}>CC64 {ws.midi.pedal?'ON':'OFF'}</span><label>Quãng<select aria-label="Quãng bàn phím" value={octave} onChange={e=>setOctave(+e.target.value)}>{[0,1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{noteName(Math.min(92,n*12))}–{noteName(Math.min(92,n*12)+35)}</option>)}</select></label><button disabled={ws.midi.deviceId!=='virtual'} aria-pressed={ws.midi.pedal} onClick={()=>ws.midi.receive([0xb0,64,ws.midi.pedal?0:127],performance.now())}>Pedal</button></div><div className="piano">{white.map(n=><button {...button(n)} className={'white-key'+(held.includes(n)?' held':'')+(expected.includes(n)?' expected':'')} style={{width:100/white.length+'%'}}><span>{noteName(n)}</span></button>)}{notes.filter(black).map(n=><button {...button(n)} className={'black-key'+(held.includes(n)?' held':'')+(expected.includes(n)?' expected':'')} style={{width:65/white.length+'%',left:(white.filter(x=>x<n).length-.325)*100/white.length+'%'}}><span>{noteName(n)}</span></button>)}</div><span className="sr-only">Phím máy tính A W S E D F T G Y H U J tương ứng các phím giữa.</span></div>;
}

export function Results({result:r}:{result:SavedAttempt}){
  const [replay,setReplay]=useState('');
  if(r.schemaVersion!==2)return <main className="results-page"><h1 id="view-heading">{r.title}</h1><p>Kết quả từ bộ chấm cũ · chỉ đọc. Không replay hoặc so điểm với bộ chấm mới.</p><button onClick={()=>download(JSON.stringify(r,null,2),'ket-qua-cu.json','application/json')}>Tải dữ liệu đã lưu</button><button onClick={run(()=>ws.openProject(r.projectId))}>Mở đúng bài trong Editor</button><button onClick={()=>ws.navigate('history')}>Lịch sử</button></main>;
  const m=r.metrics,targets=new Map(r.timeline.targets.map(t=>[t.id,t]));
  const previous=ws.state.history.find((p):p is AttemptResult=>p.schemaVersion===2&&p.id!==r.id&&canCompare(p,r));
  return <main className="results-page"><div className="page-title"><div><div className="eyebrow">KẾT QUẢ LUYỆN TẬP</div><h1 id="view-heading" tabIndex={-1}>{r.title}</h1><p>{date(r.createdAt)} · {r.settings.mode==='bpm'?'Theo BPM':'Đúng nốt'} · {r.settings.bpm} BPM · {r.outcome==='complete'?'Hoàn thành':r.outcome==='aborted'?'Đã dừng sớm':'Gián đoạn'}</p></div><div className="button-row"><button onClick={run(async()=>{await ws.openProject(r.projectId,true);ws.updatePracticeSettings(r.settings);})}>Tập lại</button><button onClick={run(()=>ws.openProject(r.projectId))}>Về Editor</button><button onClick={()=>ws.navigate('history')}>Lịch sử</button></div></div>
    <div className="metric-grid">{[['Nốt đã đánh giá',`${m.evaluated}/${m.planned}`],['Nốt nhận đúng',`${m.hits} · ${percent(m.coverage)}`],['Miss',m.misses],['Input thừa',m.extras],['Độ chính xác input',percent(m.precision)],['Accuracy osu!mania',percent(m.accuracy)],['Lệch tuyệt đối · trung vị',m.medianAbsMs===null?'—':m.medianAbsMs.toFixed(1)+' ms'],['Xu hướng sớm / trễ',m.signedMeanMs===null?'—':m.signedMeanMs.toFixed(1)+' ms']].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p>Accuracy = tổng điểm judgement / (305 × số nốt đã đánh giá). Input thừa không làm giảm accuracy osu!; hãy đọc cùng số input thừa và độ chính xác input = nốt nhận đúng / số lần bấm được chấm, gồm cả lần bấm nhận Miss. Lượt dừng sớm không chấm nốt tương lai thành miss.</p>
    {previous&&<p>Lượt cùng điều kiện trước: {date(previous.createdAt)} · accuracy {percent(previous.metrics.accuracy)} · input thừa {previous.metrics.extras}.</p>}
    {!!r.faults.length&&<p role="alert">Lỗi giao MIDI: {r.faults.join(', ')}. Không dùng lượt gián đoạn để so tiến bộ.</p>}
    {r.simulation&&<p className="policy-warning">MIDI mô phỏng {r.simulation.deltaMs} ms · dùng kiểm thử, không tính là lượt chơi thật.</p>}
    <div className="button-row"><button onClick={()=>download(JSON.stringify(r,null,2),'pianist-result-v2.json','application/json')}>Tải JSON</button><button onClick={()=>download(attemptCsv(r),'pianist-notes-v2.csv','text/csv')}>Tải CSV từng nốt</button>{r.replay&&<button onClick={run(()=>{const v=replayAttempt(r.timeline,r.replay!.commands);setReplay(JSON.stringify(v.judgements)===JSON.stringify(r.judgements)&&JSON.stringify(v.extras)===JSON.stringify(r.extras)&&JSON.stringify(v.intervals)===JSON.stringify(r.intervals)?'Replay khớp judgement, input thừa và trạng thái MIDI.':'Replay không khớp. Giữ file JSON để kiểm tra.');})}>Kiểm chứng replay</button>}<span role="status">{replay}</span></div>
    <p className="muted">Nguồn: osu! 676f3b0 · Piano Trainer Studio b40e412. Trường độ/pedal chỉ ghi dữ liệu, chưa chấm diễn cảm.</p>
    <div className="result-box"><h2>Từng nốt đã chấm</h2><table><thead><tr><th>Ô / vòng</th><th>Nốt</th><th>Kết quả</th><th>Sớm / trễ</th><th>Tập đoạn</th></tr></thead><tbody>{r.judgements.slice(0,1000).map(j=>{const t=targets.get(j.id)!;return <tr key={j.id}><td>{t.measure+1} / {t.loop+1}</td><td>{noteName(t.pitch)}</td><td>{r.settings.mode==='wait'?'Đúng nốt':gradeText[j.grade]}</td><td>{j.seq===null||r.settings.mode==='wait'?'—':j.delta.toFixed(1)+' ms'}</td><td><button onClick={run(async()=>{await ws.openProject(r.projectId,true);ws.updatePracticeSettings({...r.settings,fromMeasure:t.measure,toMeasure:t.measure});})}>Ô {t.measure+1}</button></td></tr>;})}</tbody></table>{r.judgements.length>1000&&<p>Hiển thị 1.000 nốt đầu; CSV có toàn bộ dữ liệu.</p>}</div>
  </main>;
}

export function History(){const state=useSyncExternalStore(ws.subscribe,ws.snapshot);return <main className="history-page"><div className="page-title"><h1 id="view-heading" tabIndex={-1}>Lịch sử luyện tập</h1><button onClick={()=>ws.navigate('library')}>Thư viện</button></div><table><thead><tr><th>Bài / thời điểm</th><th>Bộ chấm</th><th>Kết quả</th><th/></tr></thead><tbody>{state.history.map(r=><tr key={r.id}><td>{r.title}<br/>{date(r.createdAt)}</td><td>{r.schemaVersion===2?'V2 · osu! / PTS':'Bản cũ · chỉ đọc'}</td><td>{r.schemaVersion===2?`${r.metrics.hits}/${r.metrics.evaluated} nốt · ${r.metrics.extras} input thừa`:'Giữ nguyên dữ liệu đã lưu'}</td><td><button onClick={()=>{ws.patch({result:r});ws.navigate('results');}}>Xem kết quả</button></td></tr>)}</tbody></table>{!state.history.length&&<p>Chưa có lượt tập được lưu.</p>}</main>;}
