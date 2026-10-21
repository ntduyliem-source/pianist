import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {workspace as ws} from '../workspace';
import {Practice} from '../practice/PracticeScreen';
import {ExerciseRenderer} from '../../../../packages/exercise-renderer';
import type {ScoreSnapshot} from '../../../../packages/score-contracts';
import {createTimeline} from '../../../../packages/practice-engine-v2/score-adapter';
import type {AttemptResult,PracticeSettings} from '../../../../packages/practice-engine-v2/model';
import {loadBank,importBank,useHostedBank,getData,putData,type Bank,type Exercise,type Hand} from './bank';
import {ExerciseSelector,type Seen} from './selector';
import {exerciseSettings} from './settings';
import * as libraryStorage from '../platform/storage';
import './exercises.css';

const grades=[
  ['Hướng đi của nốt','Nốt lặp, bước liền bậc trong vùng Do–Sol.'],
  ['Quãng ba','Quãng ba, hoặc cặp móc đơn đi liền bậc.'],
  ['Quãng bốn, quãng năm','Nhận bước nhảy rộng hơn và hình nốt rải.'],
  ['Vị trí mới','Đọc ngoài vùng Do–Sol và những đoạn đổi vùng.'],
  ['Hai tay cơ bản','Giai điệu ở một tay, phần còn lại đơn giản.'],
  ['Quãng sáu đến tám','Đọc bước nhảy quãng sáu, bảy và tám.'],
  ['Đọc tiết tấu','Chấm dôi, nối nốt, đảo phách và nhịp kép.'],
  ['Âm vực và tổng hợp','Dòng kẻ phụ, âm vực xa và mẫu tổng hợp.'],
];
const handName={any:'Mọi loại',right:'Tay phải',left:'Tay trái',both:'Hai tay'};
type Selection={grade:number;length:string;hand:Hand|'any';mode:'wait'|'bpm';bpm:number;auto:boolean};
const defaults:Selection={grade:1,length:'n4',hand:'any',mode:'bpm',bpm:60,auto:true};
type Ready={entry:Exercise;bytes:Uint8Array;snapshot:ScoreSnapshot};
type Run={abort:AbortController;renderer:ExerciseRenderer;selector:ExerciseSelector;queue:Promise<Ready>[];seen:Seen[];bank:Bank;number:number;manual:boolean;total:number};
const safeLink=(url:string)=>/^https?:\/\//.test(url)?url:undefined;

export function Exercises(){
  useSyncExternalStore(ws.subscribe,ws.snapshot);
  const [bank,setBank]=useState<Bank>(),[selection,setSelection]=useState<Selection>(defaults),[rows,setRows]=useState<Exercise[]>([]);
  const [busy,setBusy]=useState('Đang tải kho bài tập…'),[error,setError]=useState(''),[ready,setReady]=useState<Ready>(),[config,setConfig]=useState<PracticeSettings>();
  const [number,setNumber]=useState(0),[nextLabel,setNextLabel]=useState(''),[summary,setSummary]=useState(''),[autoStart,setAutoStart]=useState(0),[simulation,setSimulation]=useState<{deltaMs:number;reference:boolean}>();
  const file=useRef<HTMLInputElement>(null),run=useRef<Run|undefined>(undefined),alive=useRef(true),choice=useRef(selection),lastConfig=useRef(config),advanceRef=useRef<((auto:boolean)=>Promise<void>)|undefined>(undefined);
  const [catalogVersion,setCatalogVersion]=useState(0);
  const auditionAbort=useRef<AbortController|undefined>(undefined);
  choice.current=selection;lastConfig.current=config;
  const stopRun=()=>{auditionAbort.current?.abort();const r=run.current;run.current=undefined;r?.abort.abort();r?.renderer.dispose();if(ws.session){ws.session.dispose();ws.session=undefined;}ws.midi.release();};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stopRun();};},[]);
  useEffect(()=>{void getData<{id:string;selection:Selection}>('settings','selection').then(s=>{if(s&&alive.current&&s.selection.grade>=1&&s.selection.grade<=8)setSelection({...defaults,...s.selection});}).catch(()=>{});},[]);
  useEffect(()=>{const abort=new AbortController();setBusy('Đang tải kho bài tập…');setError('');setBank(undefined);setRows([]);
    void loadBank(abort.signal).then(b=>{if(!abort.signal.aborted)setBank(b);}).catch(e=>{if(!abort.signal.aborted)setError(String(e.message??e));}).finally(()=>{if(!abort.signal.aborted)setBusy('');});return()=>abort.abort();
  },[catalogVersion]);
  useEffect(()=>{
    if(!bank)return;const abort=new AbortController();setRows([]);setError('');
    const option=bank.index.options.find(o=>o.grade===selection.grade&&o.lengthBucket===selection.length);
    if(!option)return;
    setBusy('Đang tải nhóm bài…');
    void bank.option(option,abort.signal).then(e=>{if(!abort.signal.aborted)setRows(e);}).catch(e=>{if(!abort.signal.aborted)setError(String(e.message??e));}).finally(()=>{if(!abort.signal.aborted)setBusy('');});
    return()=>abort.abort();
  },[bank,selection.grade,selection.length]);
  const change=(patch:Partial<Selection>)=>{setSelection(s=>{const next={...s,...patch};void putData('settings',{id:'selection',selection:next}).catch(e=>setError(String(e)));return next;});};
  const eligible=rows.filter(e=>selection.hand==='any'||e.hand===selection.hand);
  const optionCount=(grade:number,length:string)=>{const o=bank?.index.options.find(o=>o.grade===grade&&o.lengthBucket===length);return !o?0:selection.hand==='any'?o.count:o.byHand[selection.hand];};
  const ensureCurrent=(r:Run)=>{r.abort.signal.throwIfAborted();if(run.current!==r||!alive.current)throw new DOMException('Đã đổi lượt.','AbortError');};
  const fill=(r:Run)=>{
    while(r.queue.length<3){
      const entry=r.selector.take();if(!entry)break;
      const promise=(async()=>{
        const bytes=await r.bank.bytes(entry,r.abort.signal);ensureCurrent(r);
        const rendered=await r.renderer.prepare(bytes,entry.id+'.mxl',r.abort.signal);ensureCurrent(r);
        const snapshot:ScoreSnapshot={...rendered.snapshot,title:entry.title,projectId:'exercise:'+entry.id,fingerprint:entry.sha256};
        if(rendered.sourceHash!==entry.sha256)throw Error('Renderer nhận sai bài tập.');
        const timeline=createTimeline(snapshot,exerciseSettings(snapshot,entry,choice.current,ws.midi.deviceId));
        if(timeline.targets.length!==entry.targetCount)throw Error('Số nốt native khác hồ sơ K5; bài chưa được mở.');
        return {entry,bytes,snapshot};
      })();
      // Prefetch failures are surfaced when dequeued, never unhandled rejections.
      void promise.catch(()=>{});r.queue.push(promise);
    }
    const next=r.queue[0];
    if(next)void next.then(item=>{if(run.current===r)setNextLabel(item.entry.title);}).catch(()=>{if(run.current===r)setNextLabel('Chưa tải được bài kế');});
    else setNextLabel('Đã hết lựa chọn này');
  };
  const advance=async(auto=false)=>{
    const r=run.current;if(!r)return;ensureCurrent(r);setError('');setBusy('Đang chuẩn bị khuông nhạc…');
    auditionAbort.current?.abort();
    try{
      fill(r);const pending=r.queue.shift();
      if(!pending){setSummary('Đã xem hết '+r.total+' bài của lựa chọn này. Chọn lại để bắt đầu vòng mới.');return;}
      const item=await pending;ensureCurrent(r);
      ws.session?.dispose();ws.session=undefined;
      r.number++;setNumber(r.number);setReady(item);
      const prior=lastConfig.current;
      const next=exerciseSettings(item.snapshot,item.entry,choice.current,ws.midi.deviceId);
      if(prior){for(const key of ['mode','bpm','difficulty','countIn','metronome','pedalEnabled','durationEnabled','offsetMs'] as const)(next as any)[key]=prior[key];}
      if(!prior||prior.deviceId!==ws.midi.deviceId){const calibration=await libraryStorage.get<{id:string;offsetMs:number}>('settings','calibration-v2:'+ws.midi.deviceId);next.offsetMs=calibration?.offsetMs??0;}
      ensureCurrent(r);setConfig(next);lastConfig.current=next;
      r.seen=r.seen.filter(s=>s.id!==item.entry.id);r.seen.push({id:item.entry.id,motif:item.entry.motifGroupId,source:item.entry.sourceId,at:Date.now()});
      await putData('seen',{id:'history',items:r.seen.slice(-10000)});ensureCurrent(r);
      fill(r);if(auto)setAutoStart(n=>n+1);
    }catch(e){if(run.current===r&&!r.abort.signal.aborted)setError(String(e instanceof Error?e.message:e));}
    finally{if(run.current===r)setBusy('');}
  };
  advanceRef.current=advance;
  const begin=async()=>{
    if(!bank||!eligible.length||busy)return;
    setBusy('Đang chuẩn bị bài tập…');
    stopRun();setSummary('');setSimulation(undefined);setAutoStart(0);lastConfig.current=undefined;setConfig(undefined);setReady(undefined);
    const history=await getData<{id:string;items:Seen[]}>('seen','history');if(!alive.current)return;
    const r:Run={abort:new AbortController(),renderer:new ExerciseRenderer(),selector:new ExerciseSelector(eligible,history?.items??[]),queue:[],seen:history?.items??[],bank,number:0,manual:false,total:eligible.length};
    run.current=r;await advance();
  };
  const manualNext=async(exit=false)=>{
    const r=run.current;if(!r||busy)return;r.manual=true;
    if(ws.session&&!['ready','finished'].includes(ws.session.status)){await ws.session.finish();if(ws.session.status!=='finished'){r.manual=false;throw Error('Chưa kết thúc được lượt.');}}
    r.manual=false;
    if(exit){stopRun();setReady(undefined);setConfig(undefined);setBusy('');setError('');ws.restoreExerciseEditor();}
    else{setSimulation(undefined);await advance();}
  };
  const complete=async(result:AttemptResult)=>{
    const r=run.current,item=ready;if(!r||!item)return;
    const manual=r.manual;
    await putData('attempts',{id:'last',releaseId:r.bank.index.releaseId,exerciseId:item.entry.id,result});
    if(run.current!==r)return;
    setSummary(`${result.metrics.hits}/${result.metrics.planned} nốt · ${result.metrics.misses} bỏ lỡ · ${result.metrics.extras} thừa${result.settings.mode==='bpm'&&result.metrics.accuracy!==null?' · '+(result.metrics.accuracy*100).toFixed(1)+'%':''}${result.simulation?' · Mô phỏng':''}`);
    if(result.outcome==='complete'&&!manual&&choice.current.auto){
      setSimulation(result.simulation?{deltaMs:result.simulation.deltaMs,reference:result.simulation.script==='native-release-pedal'}:undefined);
      await advanceRef.current?.(true);
    }
  };
  const updateSettings=(patch:Partial<PracticeSettings>)=>{
    // Grade excerpts are complete units; practice UI cannot discard voices/hands.
    const allowed=['mode','bpm','countIn','difficulty','metronome','pedalEnabled','durationEnabled','offsetMs','deviceId','inputSource'] as const;
    setConfig(c=>{if(!c)return c;const next={...c};for(const key of allowed)if(key in patch)(next as any)[key]=patch[key];return next;});
    if(patch.offsetMs!==undefined&&Number.isFinite(patch.offsetMs)&&Math.abs(patch.offsetMs)<=500)void libraryStorage.put('settings',{id:'calibration-v2:'+ws.midi.deviceId,offsetMs:patch.offsetMs}).catch(e=>setError(String(e)));
  };
  const importFile=async(f:File)=>{setError('');try{await importBank(f,setBusy);if(alive.current)setCatalogVersion(n=>n+1);}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy('');}};
  if(ready&&config){const r=run.current!;return <Practice snapshot={ready.snapshot} config={config} exercise={{autoStart,simulation,loading:!!busy,error,onSettings:updateSettings,onComplete:complete,
    prepareListen:async()=>{const abort=auditionAbort.current=new AbortController();setBusy('Đang chuẩn bị nghe…');try{return await ws.exerciseAudition(ready.bytes,abort.signal);}finally{if(alive.current)setBusy('');ws.patch({busy:''});}},
    controls:<><button onClick={()=>void ws.run(()=>manualNext(true))} disabled={!!busy} aria-label="Chọn bài tập khác">‹ Chọn bài</button><span className="exercise-current" data-exercise-id={ready.entry.id}>G{selection.grade} · {handName[ready.entry.hand]} · {ready.entry.targetCount} nốt · {number}/{r.total}</span><label><input type="checkbox" checked={selection.auto} onChange={e=>change({auto:e.target.checked})}/>Tự chuyển</label><button onClick={()=>void ws.run(()=>manualNext())} disabled={!!busy||(!r.queue.length&&!r.selector.left)} aria-label="Bài tập kế tiếp">Bài kế ›</button><span role="status" className="exercise-summary">{busy||error||summary}</span></>,
    details:<details><summary>{ready.entry.title} · ô {ready.entry.sourceMeasures.join('–')} · Nguồn & bài kế</summary><p>Bài kế: {nextLabel}. Mỗi bài đếm vào riêng. BPM kết thúc theo thời gian kể cả khi đánh sai; Đúng nốt đợi nhận đủ nốt.</p>{ready.entry.sources.map((s,i)=><p key={i}><a href={safeLink(s.source_url)} target="_blank" rel="noreferrer">{s.title||ready.entry.title}</a>{s.composer?' · '+s.composer:''} · <a href={safeLink(s.license_url)} target="_blank" rel="noreferrer">{s.license_id}</a></p>)}<p>Trích theo dấu hiệu cấu trúc trong bản nhạc; chưa được giáo viên duyệt riêng từng câu.</p></details>
  }}/>;}
  return <main className="page exercises-home">
    <div className="exercise-intro"><div><div className="eyebrow">ĐỌC NHẠC · TẬP TỪ NHẠC THẬT</div><h1 id="view-heading" tabIndex={-1}>Mỗi lần, một đoạn nhạc mới.</h1><p>Chọn mức, tay và độ dài. Nghe mẫu, tập trên sheet và chuyển sang bài kế.</p></div><strong className="exercise-total">{bank?bank.index.total.toLocaleString('vi'):'—'}<small>bài trong kho</small></strong></div>
    <section aria-labelledby="exercise-grade-heading"><h2 id="exercise-grade-heading">1. Chọn grade</h2><div className="exercise-grades">{grades.map(([title,description],i)=><button key={i} aria-label={'Grade '+(i+1)} aria-pressed={selection.grade===i+1} onClick={()=>change({grade:i+1})}><span>G{i+1}</span><strong>{title}</strong><small>{description}</small><em>{bank?.index.options.filter(o=>o.grade===i+1).reduce((n,o)=>n+o.count,0).toLocaleString('vi')??'—'} bài</em></button>)}</div></section>
    <section className="exercise-choices" aria-labelledby="exercise-options-heading"><h2 id="exercise-options-heading">2. Chọn cách tập</h2><div className="exercise-fields"><label>Tay<select aria-label="Tay bài tập" value={selection.hand} onChange={e=>change({hand:e.target.value as Selection['hand']})}>{Object.entries(handName).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Chế độ<select aria-label="Chế độ bài tập" value={selection.mode} onChange={e=>change({mode:e.target.value as Selection['mode']})}><option value="bpm">Theo BPM</option><option value="wait">Đúng nốt</option></select></label><label>BPM<input aria-label="BPM bài tập" type="number" min={20} max={300} value={selection.bpm} onChange={e=>change({bpm:Math.max(20,Math.min(300,+e.target.value||20))})}/></label></div>
      <div className="exercise-lengths" role="group" aria-label="Độ dài bài tập">{(bank?.index.lengthBuckets??[{id:'n4',label:'Khoảng 4 nốt',min:3,max:5}]).map(b=><button key={b.id} aria-pressed={selection.length===b.id} onClick={()=>change({length:b.id})}><strong>{b.label}</strong><span>{b.min}–{b.max} nốt · {optionCount(selection.grade,b.id)} bài</span></button>)}</div>
      <div className="exercise-launch"><div><strong>{eligible.length.toLocaleString('vi')} bài · {new Set(eligible.map(e=>e.motifGroupId)).size.toLocaleString('vi')} nhóm mẫu</strong><p>{eligible.length?eligible.length<300?'Lựa chọn này chưa đủ mốc 300 bài.':'Chọn bài chưa gặp trước; không lặp trong cùng lượt.':'Chưa có bài phù hợp. Thử độ dài hoặc tay khác.'}</p></div><button className="primary" disabled={!!busy||!eligible.length} onClick={()=>void ws.run(begin)}>Mở bài tập →</button></div>
      {!busy&&!eligible.length&&<div className="exercise-suggestions">Có thể chọn: {bank?.index.options.filter(o=>o.count>0).sort((a,b)=>Number(b.grade===selection.grade)-Number(a.grade===selection.grade)).slice(0,3).map(o=><button key={o.path} onClick={()=>change({grade:o.grade,length:o.lengthBucket,hand:'any'})}>G{o.grade} · {bank.index.lengthBuckets.find(b=>b.id===o.lengthBucket)?.label} · {o.count} bài</button>)}</div>}
      <p className="exercise-help">Đếm số lần vào nốt, giữ trọn đoạn đã xuất. Hai tay dùng hai khuông; bài một tay ghi rõ tay. Mỗi bài có đếm vào riêng, không nối thành một bài liên tục.</p>
    </section>
    {busy&&<p role="status">{busy}</p>}{error&&<p className="exercise-error" role="alert">{error} <button onClick={()=>setCatalogVersion(n=>n+1)}>Thử tải lại</button></p>}
    <details className="exercise-bank-tools"><summary>Kho bài tập & nhập thêm</summary><p>{bank?.index.visibility==='public'?'Kho online gồm các nguồn đã rà giấy phép. Nhập gói K5 ZIP để dùng trọn kho riêng trên thiết bị này.':`Đang dùng kho ${bank?.index.visibility==='device-only'?'đã nhập trên thiết bị':'local'}; dữ liệu nhạc không được tải lên tài khoản.`}</p><button disabled={!!busy} onClick={()=>file.current?.click()}>Nhập gói K5 ZIP</button> <button disabled={!!busy} onClick={()=>void ws.run(async()=>{await useHostedBank();setCatalogVersion(n=>n+1);})}>Dùng kho có sẵn trên web</button><p>Grade là quy tắc nội dung đã công bố; mốc 300 là mục tiêu số lượng, không phải liều luyện tập được khoa học chứng minh. Grade nào cũng có thể chọn.</p><small>{bank?.index.sourceRelease}</small></details>
    <input ref={file} type="file" accept=".zip" aria-label="Nhập kho K5 ZIP" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/>
  </main>;
}
