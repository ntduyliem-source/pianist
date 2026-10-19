import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {ScoreSnapshot} from '../../../../packages/score-contracts';
import type {PracticeSettings,EngineView,ReleaseJudgement,AttemptResult} from '../../../../packages/practice-engine-v2/model';
import {createTimeline} from '../../../../packages/practice-engine-v2/score-adapter';
import {ManiaHitWindows} from '../../../../packages/practice-engine-v2/upstream/mania';
import {workspace as ws} from '../workspace';
import {noteName} from '../platform/midi-v2';
import {PracticeController} from './controller-v2';
import {feedback} from './feedback-v2';
import {Sheet} from './Sheet';
import {PracticePiano} from './PracticePiano';
import {CalibrationView} from './CalibrationView';
import {simulateMidi} from './midi-simulation-v2';
import {scorePositions,beatPosition} from './score-viewport';
import {ScorePreview} from './score-preview';
import {NumberField} from './NumberField';
import './practice-v2.css';

const empty:EngineView={judgements:[],extras:[],held:[],pedal:false,intervals:[],group:0,done:false,processedMs:0,faults:[]};
const gradeText={perfect:'Perfect',great:'Great',good:'Good',ok:'OK',meh:'Meh',miss:'Bỏ lỡ'};
const releaseText:Record<ReleaseJudgement['status'],string>={correct:'Nhả đúng',early:'Nhả sớm',late:'Nhả trễ',unreleased:'Chưa nhả',interrupted:'Bị ngắt',pending:'Đang giữ nốt',unavailable:'Chưa có mốc nhả','no-attack':'Chưa nhận đúng nốt'};
type Presentation={keyboard:boolean;scroll:boolean;zoom:number|'fit'};
function presentation():Presentation{try{const p=JSON.parse(localStorage.getItem('pianist.practice-ui.v2')??'{}');return{keyboard:p.keyboard!==false,scroll:p.scroll!==false,zoom:[60,80,100,120,150,180].includes(p.zoom)?p.zoom:'fit'};}catch{return{keyboard:true,scroll:true,zoom:'fit'};}}

export function Practice({snapshot,config:c}:{snapshot:ScoreSnapshot;config:PracticeSettings}){
  useSyncExternalStore(ws.subscribe,ws.snapshot);
  const root=useRef<HTMLElement>(null),dialog=useRef<HTMLDialogElement>(null),preview=useRef<ScorePreview|null>(null),working=useRef(false);
  const persistAttempt=useRef<((r:AttemptResult,show:boolean)=>Promise<void>)|null>(null);
  const[,refresh]=useState(0),[prefs,setPrefs]=useState(presentation),[focus,setFocus]=useState(false),[barHidden,setBarHidden]=useState(false),[panel,setPanel]=useState<'settings'|'range'|null>(null);
  const[selecting,setSelecting]=useState<'a'|'b'|null>(null),[keepReplay,setReplay]=useState(true),[followToken,setFollowToken]=useState(0),[previewAt,setPreviewAt]=useState<number|null>(null),[busy,setBusy]=useState(false);
  const session=ws.session,status=session?.status??'ready',active=!!session&&!['ready','finished'].includes(status),playing=active&&['running','counting'].includes(status);
  const parsed=useMemo(()=>{try{return{timeline:createTimeline(snapshot,c),error:''};}catch(e){return{timeline:undefined,error:String(e)};}},[snapshot,c]);
  const t=active?session!.timeline:parsed.timeline,view=active?session!.view:empty,held=ws.midi.heldPitches();
  const position=previewAt??(active?session!.elapsedMs:0);
  const heldNotes=playing?ws.midi.heldNotes():[];
  const f=useMemo(()=>t?feedback(t,view,position,heldNotes,previewAt!==null):{markers:new Map(),currentAnchors:[],expected:[],visit:0},[t,view,position,heldNotes.map(e=>e.sequence).join(','),previewAt!==null]);
  const locate=useMemo(()=>t?scorePositions(snapshot,t):undefined,[snapshot,t]);
  const cursor=locate?.(position,c.mode==='wait'&&previewAt===null?view.group:undefined);
  const beat=t?beatPosition(t,position):{beat:0,total:0,bpm:c.bpm};
  const count=active&&status==='counting'?Math.max(1,Math.ceil((session!.transport.mapping.resumeAtMs-session!.transport.now)/(60000/c.bpm))):0;
  const currentMeasure=cursor?.measure??c.fromMeasure,loop=cursor?.loop??0;
  const names=(pitches:number[])=>[...new Set(pitches)].map(noteName).join(' · ')||'—';
  const targetIndex=useMemo(()=>new Map(t?.targets.map(n=>[n.id,n])??[]),[t]);
  const judged=useMemo(()=>new Set(view.judgements.map(j=>j.id)),[view.judgements]);
  const missing=c.mode==='wait'?(t?.groups[view.group]?.ids.filter(id=>!judged.has(id)).map(id=>targetIndex.get(id)!.pitch)??[]):[];
  const latest=view.judgements.at(-1),lastNote=latest?targetIndex.get(latest.id):undefined,release=view.releaseFeedback;
  const timing=latest?.seq!==null&&latest?.seq!==undefined?`${latest.delta<0?'Sớm':latest.delta>0?'Trễ':'Đúng mốc'}${latest.delta?` ${Math.abs(latest.delta).toFixed(0)} ms`:''}`:latest?'Bỏ lỡ nốt':'Chưa có kết quả';
  const pedalReference=!!t?.pedalReference&&!!t.pedals?.length;
  const pedalExpected=!!(active&&c.mode==='bpm'&&t?.pedals?.some(p=>p.atMs<=position&&p.endMs>position));
  const windows=new ManiaHitWindows(c.difficulty).values;
  const device=ws.midi.deviceId==='virtual'?'Bàn phím ảo':ws.midi.ports.find(p=>p.id===ws.midi.deviceId)?.name??'Đàn MIDI';
  const message=previewAt!==null?'Đang nghe đoạn':count?`Đếm vào · ${count}`:status==='running'?'Đang tập':status==='paused'?'Tạm dừng':status==='interrupted'?'Đã gián đoạn':'Sẵn sàng';
  const setPref=(patch:Partial<Presentation>)=>setPrefs(p=>{const next={...p,...patch};try{localStorage.setItem('pianist.practice-ui.v2',JSON.stringify(next));}catch{}return next;});
  const stopPreview=()=>{preview.current?.stop();preview.current=null;setPreviewAt(null);};
  const update=(patch:Partial<PracticeSettings>)=>{if(!active){stopPreview();if(patch.pedalEnabled===false&&ws.midi.deviceId==='virtual')ws.midi.receive([0xb0,64,0],performance.now());ws.updatePracticeSettings(patch);setFollowToken(n=>n+1);}};
  const act=(fn:()=>unknown|Promise<unknown>)=>async()=>{if(working.current)return;working.current=true;setBusy(true);try{await ws.run(fn);}finally{working.current=false;setBusy(false);}};

  useEffect(()=>{
    const el=root.current;
    const full=()=>{setFocus(document.fullscreenElement===el);setBarHidden(false);setFollowToken(n=>n+1);};
    const hidden=()=>{if(document.hidden)preview.current?.stop();};
    const blur=()=>preview.current?.stop();
    document.addEventListener('fullscreenchange',full);document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',blur);
    return()=>{document.removeEventListener('fullscreenchange',full);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur);preview.current?.stop();if(document.fullscreenElement===el)void document.exitFullscreen().catch(()=>{});delete document.body.dataset.practiceFocus;if(ws.session&&['ready','finished'].includes(ws.session.status)){ws.session.dispose();ws.session=undefined;}};
  },[]);
  useEffect(()=>{document.body.dataset.practiceFocus=String(focus);setFollowToken(n=>n+1);},[focus]);
  useEffect(()=>{if(panel&&!dialog.current?.open)dialog.current?.showModal();else if(!panel&&dialog.current?.open)dialog.current.close();},[panel]);
  const exitFocus=async()=>{if(document.fullscreenElement===root.current)await document.exitFullscreen();setFocus(false);setBarHidden(false);};
  const enterFocus=async()=>{setFocus(true);setBarHidden(false);if(root.current?.requestFullscreen&&document.fullscreenEnabled){try{await root.current.requestFullscreen();}catch{ws.notice('Đã mở chế độ chỉ bản nhạc trong cửa sổ trình duyệt.');}}};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!dialog.current?.open&&focus&&!document.fullscreenElement){e.preventDefault();void exitFocus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[focus]);

  const start=async(simulationDelta?:number,releaseReference=false)=>{
    stopPreview();setPanel(null);setSelecting(null);
    const next=createTimeline(snapshot,ws.state.config??c);ws.session?.dispose();
    const s=ws.session=new PracticeController(next,snapshot.title);s.onChange=()=>{refresh(n=>n+1);ws.patch({});};
    const persist=(r:AttemptResult,show:boolean)=>{if(simulationDelta!==undefined)r.simulation={script:releaseReference?'native-release-pedal':'native-targets-onset',deltaMs:simulationDelta};return ws.recordResult(r,keepReplay,show);};
    persistAttempt.current=persist;s.onComplete=r=>{void persist(r,true);};
    setFollowToken(n=>n+1);await s.start(()=>ws.midi.stateEvents());if(simulationDelta!==undefined)simulateMidi(s,ws.midi,simulationDelta,releaseReference);
  };
  const toggle=async()=>{stopPreview();if(!active)await start();else if(playing)session!.pause();else{setFollowToken(n=>n+1);await session!.resume(()=>ws.midi.stateEvents());}};
  const restart=async()=>{
    stopPreview();if(active){let saving:Promise<void>|undefined;const persist=persistAttempt.current;session!.onComplete=r=>{saving=persist?persist(r,false):ws.recordResult(r,keepReplay,false);};await session!.finish();if(session!.status!=='finished')throw Error(session!.message||'Chưa thể kết thúc lượt cũ.');await saving;}
    await start();
  };
  const listen=async()=>{
    if(preview.current){stopPreview();return;}if(active||!t)return;
    const p=new ScorePreview();preview.current=p;setPreviewAt(0);setFollowToken(n=>n+1);
    p.onPosition=setPreviewAt;p.onStop=()=>{if(preview.current===p){preview.current=null;setPreviewAt(null);}};
    try{await p.start(t);}catch(e){p.stop();throw e;}
  };
  const openPanel=(next:'settings'|'range')=>{if(playing)session!.pause();stopPreview();setPanel(next);};
  const rangeEdit=(value:number,side:'a'|'b')=>{if(!Number.isFinite(value))return;const n=Math.max(0,Math.min(snapshot.measures.length-1,Math.trunc(value)));update(side==='a'?{fromMeasure:n,toMeasure:Math.max(n,c.toMeasure)}:{toMeasure:n,fromMeasure:Math.min(n,c.fromMeasure)});};
  const selectMeasure=(index:number)=>{if(!selecting||active)return;rangeEdit(index,selecting);setSelecting(null);};
  const pedalToggle=<label className="v2-check"><input aria-label="Dùng pedal khi tập" type="checkbox" checked={c.pedalEnabled!==false} disabled={active} onChange={e=>update({pedalEnabled:e.target.checked})}/>Pedal</label>;

  return <main ref={root} className={'page practice-v2'+(focus?' sheet-focus':'')+(barHidden?' controls-hidden':'')} data-testid="practice-v2">
    <header className="v2-heading" hidden={focus}><div className="v2-title"><div className="v2-eyebrow">TẬP PIANO</div><h1 id="view-heading" tabIndex={-1}>{snapshot.title}</h1><p>{c.hand==='both'?'Hai tay':c.hand==='right'?'Tay phải':'Tay trái'} · Ô {currentMeasure+1} / {snapshot.measures.length} · <span role="status">{message}</span></p></div><span className="v2-device">● {device}</span><button onClick={()=>openPanel('settings')}>☷ Thiết lập</button><button className="primary-light" onClick={()=>void enterFocus()}>⛶ Chỉ bản nhạc</button></header>

    <div className="v2-transport" hidden={barHidden&&focus} role="group" aria-label="Điều khiển tập luyện">
      <button className="primary v2-play" disabled={busy||!t||(active&&!playing&&ws.midi.deviceId!==c.deviceId)} onClick={act(toggle)}>{playing?'Ⅱ Tạm dừng':active?'▶ Tiếp tục':'▶ Bắt đầu'}</button>
      <button disabled={busy||!t} onClick={act(restart)} aria-label="Tập lại đoạn" title="Lưu lượt hiện tại và tập lại đoạn A–B">↺ <span className="v2-normal">Lại đoạn</span></button>
      <button disabled={busy||!active} onClick={act(()=>session!.finish())} aria-label="Kết thúc lượt tập" title="Kết thúc lượt tập">■</button>
      <div className="v2-mode" hidden={focus}><button disabled={active} aria-pressed={c.mode==='wait'} onClick={()=>update({mode:'wait'})}>Đúng nốt</button><button disabled={active} aria-pressed={c.mode==='bpm'} onClick={()=>update({mode:'bpm'})}>Theo BPM</button></div>
      <span className="v2-focus-context" hidden={!focus}>{c.mode==='bpm'?'Theo BPM':'Đúng nốt'} · Ô {currentMeasure+1} · Vòng {loop+1}/{c.loops}</span>
      <span className="v2-flex"/>
      <label className="v2-tempo"><NumberField aria-label="BPM" type="number" min={20} max={300} value={active||previewAt!==null?beat.bpm:c.bpm} disabled={active||previewAt!==null} onValue={value=>update({bpm:value})}/><span>{c.beatQuarter===1.5?'♩.':c.beatQuarter===.5?'♪':'♩'} BPM</span></label>
      <div className="v2-beats" aria-label={count?`Đếm vào ${count}`:`Phách ${beat.beat+1} trên ${beat.total||snapshot.measures[currentMeasure]?.numerator||4}`}>
        {count?<strong>{count}</strong>:c.mode==='wait'&&previewAt===null?<small>Chờ nốt</small>:Array.from({length:Math.min(12,beat.total||snapshot.measures[currentMeasure]?.numerator||4)},(_,i)=><span key={i} className={i===beat.beat&&(playing||previewAt!==null)?'on':''}>{i+1}</span>)}
      </div>
      <button className="v2-normal" aria-label="Metronome" aria-pressed={c.metronome} disabled={active} onClick={()=>update({metronome:!c.metronome})}>{c.metronome?'♩ Nhịp bật':'♩ Nhịp tắt'}</button>
      {focus&&<><span className="v2-focus-feedback">{count?`Đếm vào ${count}`:c.mode==='bpm'?timing:`Thiếu ${names(missing)}`}</span><label className="v2-check"><input aria-label="Cuộn theo nhạc" type="checkbox" checked={prefs.scroll} onChange={e=>setPref({scroll:e.target.checked})}/>Theo bài</label>{pedalToggle}<span className={'v2-focus-pedal'+(ws.midi.pedal?' down':'')}>{ws.midi.pedal?'Đạp':'Nhả'}</span><button aria-label="Thiết lập" onClick={()=>openPanel('settings')}>☷</button><button onClick={()=>setBarHidden(true)} aria-label="Ẩn thanh điều khiển">⌃</button><button onClick={()=>void exitFocus()} aria-label="Thoát toàn màn hình">⛶</button></>}
    </div>
    {focus&&barHidden&&<button className="v2-reveal" onClick={()=>setBarHidden(false)}>⌄ Hiện điều khiển</button>}
    {parsed.error&&<p role="alert" className="v2-alert">{parsed.error}</p>}
    {status==='interrupted'&&<p role="alert" className="v2-alert">{session?.message}</p>}
    <div className="v2-sheet-tools" hidden={focus}>
      <button aria-expanded={panel==='range'} disabled={active} onClick={()=>openPanel('range')}>↔ Chọn đoạn</button><span className="v2-range">A {c.fromMeasure+1} — B {c.toMeasure+1}</span><span className="v2-muted">Vòng {loop+1} / {c.loops}</span><button disabled={active||busy||!t} aria-pressed={previewAt!==null} onClick={act(listen)}>{previewAt!==null?'■ Dừng nghe':'♫ Nghe đoạn'}</button>
      <span className="v2-flex"/><label className="v2-check"><input type="checkbox" aria-label="Cuộn theo nhạc" checked={prefs.scroll} onChange={e=>setPref({scroll:e.target.checked})}/>Cuộn theo nhạc</label><select aria-label="Thu phóng bản nhạc" value={prefs.zoom} onChange={e=>setPref({zoom:e.target.value==='fit'?'fit':+e.target.value})}><option value="fit">Vừa chiều rộng</option>{[60,80,100,120,150,180].map(n=><option key={n} value={n}>{n}%</option>)}</select>
    </div>
    {selecting&&<div className="v2-selection" role="status">Chọn ô nhịp {selecting.toUpperCase()} trên khuông nhạc.<button onClick={()=>setSelecting(null)}>Hủy chọn</button></div>}
    <Sheet snapshot={snapshot} markers={f.markers} cursor={cursor} zoom={prefs.zoom} autoScroll={prefs.scroll} followToken={followToken} fromMeasure={c.fromMeasure} toMeasure={c.toMeasure} selecting={selecting} onMeasure={selectMeasure}/>

    <section className="v2-feedback" hidden={focus} aria-label="Phản hồi luyện tập">
      <div><span className="v2-label">{c.mode==='wait'?'Hợp âm cần chơi':'Nốt vừa chơi'}</span><strong>{c.mode==='wait'?names(f.expected):lastNote?`${noteName(lastNote.pitch)} · ${latest?.grade==='miss'?'Bỏ lỡ':'Đã nhận'}`:'Sẵn sàng nhận phím'}</strong><small>{c.mode==='wait'?`Còn thiếu: ${names(missing)}`:held.length?`Đang giữ ${names(held)}`:`Sắp chơi: ${names(f.expected)}`}</small></div>
      <div><span className="v2-label">{c.mode==='bpm'?'Thời điểm vào nốt':'Tiến độ'}</span><strong className={latest&&['good','ok','meh','miss'].includes(latest.grade)?'v2-attention':''}>{c.mode==='bpm'?timing:`${view.judgements.length} / ${t?.targets.length??0} nốt`}</strong><small>{c.mode==='bpm'&&latest?`${gradeText[latest.grade]} · `:''}{view.extras.length} phím thừa · {view.judgements.filter(j=>j.grade==='miss').length} nốt bỏ lỡ</small></div>
      <div><span className="v2-label">Trường độ</span><strong>{c.mode==='wait'?'Không chấm ở Đúng nốt':c.durationEnabled===false?'Đã tắt chấm nhả phím':release?releaseText[release.status]:'Chờ nốt đầu tiên'}</strong><small>{release?.deltaMs!==null&&release?.deltaMs!==undefined?`${release.deltaMs>0?'+':''}${release.deltaMs.toFixed(0)} ms`:'Theo mốc nhả của bản nhạc'}</small></div>
    </section>
    <div className="v2-pedal-row" hidden={focus}>{pedalToggle}<span>Bài yêu cầu: <strong>{c.pedalEnabled===false?'Đã tắt':!pedalReference?'Không có ký hiệu':!active||c.mode==='wait'?'—':pedalExpected?'Đạp':'Nhả'}</strong></span><span>Đàn đang: <strong className={ws.midi.pedal?'v2-pedal-down':''}>{ws.midi.pedal?'Đạp':'Nhả'}</strong></span><span className="v2-flex"/><button disabled={ws.midi.deviceId!=='virtual'||c.pedalEnabled===false} aria-label="Đạp hoặc nhả pedal ảo" aria-pressed={ws.midi.pedal} onClick={()=>ws.midi.receive([0xb0,64,ws.midi.pedal?0:127],performance.now())}>{ws.midi.pedal?'Nhả pedal':'Đạp pedal'}</button></div>
    <PracticePiano held={held} expected={f.expected} expanded={prefs.keyboard} hidden={focus} onToggle={()=>setPref({keyboard:!prefs.keyboard})}/>

    <dialog ref={dialog} className="v2-drawer" aria-labelledby="v2-settings-title" onClose={()=>setPanel(null)}>
      <div className="v2-drawer-heading"><h2 id="v2-settings-title">{panel==='range'?'Đoạn luyện tập':'Thiết lập luyện tập'}</h2><button aria-label="Đóng thiết lập" onClick={()=>setPanel(null)}>×</button></div>
      {active&&<p className="v2-info">Kết thúc lượt để thay đổi cấu hình chấm. Lượt hiện tại vẫn được giữ.</p>}
      {panel==='settings'&&<fieldset disabled={active&&!['paused','interrupted'].includes(status)}><legend>Đàn MIDI</legend><div className="v2-row"><span>{device}</span><button onClick={act(()=>ws.midi.connect())}>Kết nối MIDI</button></div><label>Đầu vào<select aria-label="Thiết bị MIDI" value={ws.midi.deviceId} onChange={e=>void ws.run(async()=>{await ws.midi.select(e.target.value);update({deviceId:ws.midi.deviceId,inputSource:ws.midi.deviceId==='virtual'?'virtual':'midi'});})}><option value="virtual">Bàn phím ảo</option>{ws.midi.ports.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></fieldset>}
      <fieldset disabled={active}><legend>Đoạn A–B và vòng tập</legend><div className="v2-field-pair"><label>Từ ô<NumberField aria-label="Từ ô nhịp" type="number" min={1} max={snapshot.measures.length} value={c.fromMeasure+1} onValue={value=>rangeEdit(value-1,'a')}/></label><label>Đến ô<NumberField aria-label="Đến ô nhịp" type="number" min={1} max={snapshot.measures.length} value={c.toMeasure+1} onValue={value=>rangeEdit(value-1,'b')}/></label></div><div className="v2-row"><button onClick={()=>{setSelecting('a');setPanel(null);}}>Chọn A trên bài</button><button onClick={()=>{setSelecting('b');setPanel(null);}}>Chọn B trên bài</button></div><div className="v2-field-pair"><label>Số vòng<NumberField aria-label="Số vòng" type="number" min={1} max={10} value={c.loops} onValue={value=>update({loops:value})}/></label><label>Tăng BPM mỗi vòng<NumberField type="number" min={0} max={50} value={c.loopBpmStep} onValue={value=>update({loopBpmStep:value})}/></label></div></fieldset>
      {panel==='settings'&&<>
        <fieldset disabled={active}><legend>Nhịp và tay tập</legend><div className="v2-field-pair"><label>Đơn vị phách<select aria-label="Đơn vị phách" value={c.beatQuarter} onChange={e=>update({beatQuarter:+e.target.value as .5|1|1.5})}><option value={.5}>♪ Móc đơn</option><option value={1}>♩ Nốt đen</option><option value={1.5}>♩. Đen chấm dôi</option></select></label><label>Đếm vào · phách<NumberField aria-label="Đếm vào" type="number" min={0} max={16} value={c.countIn} onValue={value=>update({countIn:value})}/></label></div><label>Tempo<select aria-label="Tempo" value={c.tempoMode} onChange={e=>update({tempoMode:e.target.value as 'fixed'|'score'})}><option value="fixed">Cố định theo BPM</option><option value="score">Theo thay đổi tempo của bài</option></select></label><label>Tập tay<select aria-label="Tay tập" value={c.hand} onChange={e=>update({hand:e.target.value as PracticeSettings['hand']})}><option value="both">Hai tay</option><option value="right">Tay phải</option><option value="left">Tay trái</option></select></label><label className="v2-check"><input type="checkbox" checked={c.accompaniment} onChange={e=>update({accompaniment:e.target.checked})}/>Phát tay còn lại khi tập BPM</label>
          <details><summary>Phân tay theo khuông và bè</summary>{snapshot.staves.map(s=><label key={s.id}>Khuông {s.id+1} · {s.part}<select value={c.roles[s.id]} onChange={e=>update({roles:{...c.roles,[s.id]:e.target.value as 'left'|'right'|'off'}})}><option value="right">Tay phải</option><option value="left">Tay trái</option><option value="off">Bỏ qua</option></select></label>)}<div className="v2-row">{[0,1,2,3].map(v=><label className="v2-check" key={v}><input type="checkbox" checked={c.voices.includes(v)} onChange={e=>update({voices:e.target.checked?[...c.voices,v].sort():c.voices.filter(x=>x!==v)})}/>Bè {v+1}</label>)}</div></details>
        </fieldset>
        <fieldset disabled={active}><legend>Chấm thời điểm và trường độ</legend><label>Độ chặt timing<select aria-label="Độ khó timing" value={c.difficulty} onChange={e=>update({difficulty:+e.target.value})}><option value={0}>Rộng · OD 0</option><option value={5}>Tiêu chuẩn · OD 5</option><option value={10}>Chặt · OD 10</option></select></label><label className="v2-check"><input type="checkbox" checked={c.durationEnabled!==false} onChange={e=>update({durationEnabled:e.target.checked})}/>Chấm nhả phím khi tập BPM</label>{pedalToggle}<label>Bù trễ đầu vào · ms<NumberField aria-label="Bù trễ ms" type="number" min={-500} max={500} value={c.offsetMs} onValue={value=>update({offsetMs:value})}/></label><CalibrationView settings={c} onApply={offsetMs=>update({offsetMs})}/><label className="v2-check"><input type="checkbox" checked={keepReplay} onChange={e=>setReplay(e.target.checked)}/>Lưu MIDI để kiểm chứng lại</label></fieldset>
        <fieldset><legend>Hiển thị</legend><label>Thu phóng<select aria-label="Thu phóng trong thiết lập" value={prefs.zoom} onChange={e=>setPref({zoom:e.target.value==='fit'?'fit':+e.target.value})}><option value="fit">Vừa chiều rộng</option>{[60,80,100,120,150,180].map(n=><option key={n} value={n}>{n}%</option>)}</select></label><label className="v2-check"><input type="checkbox" checked={prefs.scroll} onChange={e=>setPref({scroll:e.target.checked})}/>Cuộn theo nhạc</label><label className="v2-check"><input type="checkbox" checked={prefs.keyboard} onChange={e=>setPref({keyboard:e.target.checked})}/>Hiện bàn phím hỗ trợ</label></fieldset>
        <details className="v2-policy"><summary>Quy tắc chấm và ký hiệu cần lưu ý</summary><p>{c.mode==='wait'?'Ghi nhớ từng nốt đúng trong hợp âm, không cần giữ đồng thời. Không chấm timing hoặc trường độ.':'Giữ timeline cố định. Mỗi lần bấm được chấm riêng; không chỉnh nhịp theo người chơi.'}</p><p>Perfect ±{windows.perfect} ms · Great ±{windows.great} ms. Nhả phím theo MuseScore và mir_eval; pedal nhị phân, chưa chấm half-pedal.</p>{!!snapshot.warnings.length&&<p>Ký hiệu: {snapshot.warnings.join(', ')}. Chưa mở rộng ornament hoặc rải hợp âm.</p>}</details>
        {new URLSearchParams(location.search).has('diagnostics')&&<fieldset disabled={active||c.mode!=='bpm'||ws.midi.deviceId!=='virtual'||busy}><legend>Kiểm MIDI mô phỏng</legend><button onClick={act(()=>start(-120))}>MIDI mô phỏng −120 ms</button><button onClick={act(()=>start(0,true))}>MIDI mô phỏng trường độ + pedal</button></fieldset>}
      </>}
      <div className="v2-drawer-actions"><button className="primary" onClick={()=>setPanel(null)}>Xong</button></div>
    </dialog>
  </main>;
}
