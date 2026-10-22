import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {workspace as ws} from './workspace';
import {download} from './platform/files';
import {prepareOffline, useOnline} from './platform/offline';
import {LibraryTransfer} from './platform/LibraryTransfer';
import {TuneImportDialog, SourceLabel} from './platform/TuneImportDialog';
import {Practice,Results,History} from './practice/PracticeView';
import {EditorPlayback} from './EditorPlayback';
import {EditorActions} from './EditorActions';
import {Exercises} from './exercises/Exercises';
import {groupBundledScores,selectBundledVersion,bundledVersionLabel,matchesBundledWork,type BundledWork} from './platform/bundled-library';
import './style.css';

const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);
const date = (at: number) => new Date(at).toLocaleString('vi', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
function Icon({name}: {name: string}) {
  const paths: Record<string, React.ReactNode> = {
    score: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></>,
    piano: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M12 5v14M16.5 5v14"/><path d="M7.5 5v8M12 5v8M16.5 5v8" strokeWidth="3"/></>,
    folder: <path d="M3 7h7l2-3h8v16H3z"/>, history: <><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2"/></>,
    add: <path d="M12 4v16M4 12h16"/>, upload: <><path d="M12 16V3M7 8l5-5 5 5M4 15v6h16v-6"/></>,
    play: <path d="m8 4 12 8-12 8z"/>, pause: <path d="M8 4v16M16 4v16" strokeWidth="4"/>,
    save: <><path d="M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-7h10v7"/></>,
    arrow: <path d="m9 5 7 7-7 7M3 12h13"/>, back: <path d="m12 5-7 7 7 7M5 12h16"/>,
    check: <path d="m4 12 5 5L20 5"/>, download: <><path d="M12 3v13M7 11l5 5 5-5M4 17v4h16v-4"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.score}</svg>;
}
function App() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot), file = useRef<HTMLInputElement>(null), practiceFile = useRef(false), exportDialog = useRef<HTMLDialogElement>(null), about = useRef<HTMLDialogElement>(null), saveAsDialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState('mxl'), [dragging, setDragging] = useState(false), [copyTitle, setCopyTitle] = useState('');
  useEffect(() => {
    ws.chooseFile = (practice = ws.state.view === 'practice') => {practiceFile.current = practice; file.current?.click();}; ws.showExport = () => exportDialog.current?.showModal(); ws.showAbout = () => about.current?.showModal(); ws.showSaveAs = () => {setCopyTitle((ws.state.current?.title ?? 'Bản nhạc') + ' — bản sao'); saveAsDialog.current?.showModal();};
    void ws.init(); document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => ws.focusEditor()));
    const shortcut = (event: KeyboardEvent) => {
      if (state.view !== 'editor' || !(event.ctrlKey || event.metaKey) || document.querySelector('dialog[open]')) return;
      const k = event.key.toLowerCase(); const command = k === 's' ? event.shiftKey ? ws.showSaveAs : () => ws.saveLibrary() : k === 'o' ? ws.chooseFile : k === 'n' ? () => ws.newProject() : k === 'e' && event.shiftKey ? ws.showExport : undefined;
      if (command) {event.preventDefault(); event.stopImmediatePropagation(); void ws.run(command);}
    };
    // This handler reads the current view without reinstalling the application lifecycle.
    const handler = (e: KeyboardEvent) => {if (ws.state.view === 'editor') shortcutForEditor(e);};
    function shortcutForEditor(event: KeyboardEvent) {
      if(event.code==='Space'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')){
        const target=event.composedPath()[0] as HTMLElement;
        if(target?.closest?.('button,input,textarea,select,[contenteditable=true]')&&!target.classList.contains('qt-window-focus-helper'))return;
        event.preventDefault();event.stopImmediatePropagation();
        if(!event.repeat&&!ws.state.busy&&ws.bridge)void ws.run(()=>{ws.bridge!.api.Module.driver?.resume();ws.bridge!.playback('toggle');});
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || document.querySelector('dialog[open]')) return;
      const k = event.key.toLowerCase(), command = k === 's' ? event.shiftKey ? ws.showSaveAs : () => ws.saveLibrary() : k === 'o' ? ws.chooseFile : k === 'n' ? () => ws.newProject() : k === 'e' && event.shiftKey ? ws.showExport : undefined;
      if (command) {event.preventDefault(); event.stopImmediatePropagation(); void ws.run(command);}
    }
    window.addEventListener('keydown', handler, true); return () => window.removeEventListener('keydown', handler, true);
  }, []);
  useEffect(() => {
    const diagnostics = document.getElementById('diagnostics')!; diagnostics.hidden = !new URLSearchParams(location.search).has('diagnostics');
    const actions: Record<string, () => unknown> = {snapshot: () => {if (ws.state.snapshot) download(JSON.stringify(ws.state.snapshot), 'pianist-snapshot.json', 'application/json');}, open: () => ws.chooseFile(), sample: async () => {const r = await fetch('fixtures/piano.mxl'); if (!r.ok) throw Error('Fixture unavailable'); await ws.importFile(new File([await r.blob()], 'piano.mxl'));}, save: () => ws.downloadProject(), mxl: () => ws.export('mxl'), xml: () => ws.export('musicxml'), audio: () => ws.bridge?.api.startAudioProcessing(), undo: () => ws.bridge?.api.dispatchAction('undo'), redo: () => ws.bridge?.api.dispatchAction('redo'), select: () => ws.bridge?.api.dispatchAction('select-all'), up: () => ws.bridge?.api.dispatchAction('pitch-up')};
    for (const [id, action] of Object.entries(actions)) {const el = document.getElementById(id) as HTMLButtonElement; if (el) {el.disabled = ['open', 'sample'].includes(id) ? false : !state.engineReady; el.onclick = run(action);}}
  }, [state.engineReady]);
  const active = ws.session && !['ready', 'finished'].includes(ws.session.status);
  return <div className={'application view-' + state.view} onDragOver={e => {if (e.dataTransfer.types.includes('Files')) {e.preventDefault(); setDragging(true);}}} onDragLeave={e => {if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);}} onDrop={e => {e.preventDefault(); setDragging(false); if (!active && e.dataTransfer.files[0]) void ws.run(() => ws.importFile(e.dataTransfer.files[0], ws.state.view === 'practice'));}}>
    <header className="appbar">
      <a className="brand" href="#/library" onClick={e => {e.preventDefault(); ws.navigate('library');}}><span className="brand-symbol">p</span>Pianist<span className="edition">WEB</span></a>
      <nav aria-label="Chức năng chính">
        <button className={state.view === 'library' ? 'selected' : ''} onClick={() => ws.navigate('library')} disabled={!!active}><Icon name="folder"/>Thư viện</button>
        <button className={state.view === 'editor' ? 'selected' : ''} disabled={!!active} onClick={run(() => ws.openEditor())}><Icon name="score"/>Editor</button>
        <button className={state.view === 'practice' ? 'selected' : ''} disabled={!!active && state.view !== 'practice'} onClick={run(() => ws.openPractice())}><Icon name="piano"/>Tập piano</button>
      </nav>
      <div className="appbar-end"><span className="local-tag"><span/>Lưu trên thiết bị</span><button className="icon-button" title="Giới thiệu và giấy phép" aria-label="Giới thiệu" onClick={() => about.current?.showModal()}>?</button></div>
    </header>
    {state.error && !state.engineFailed && <div className="error-banner" role="alert"><span>{state.error}</span><button onClick={() => ws.patch({error: ''})}>Đóng</button>{state.current && <button onClick={run(() => ws.downloadProject())}>Tải bản sao MSCZ</button>}</div>}
    {!!state.importDiagnostics?.length && !state.error && !state.busy && <div className="error-banner import-notice" role="status"><details><summary>Đã mở ABC · có thay đổi trình bày</summary><ul>{state.importDiagnostics.map((d, i) => <li key={i}>{d.message}</li>)}</ul></details><button onClick={() => ws.patch({importDiagnostics: undefined})}>Đóng</button></div>}
    {state.engineFailed && <div className="loading-overlay" role="alert"><h2>{state.error}</h2><button className="primary" onClick={() => location.reload()}>Tải lại trang</button></div>}
    {state.view === 'editor' && <EditorActions title={state.current?.title} saveState={state.saveState} onExport={()=>exportDialog.current?.showModal()}/>}
    {state.view === 'editor' && state.engineReady && state.current && <EditorPlayback key={state.current.id}/>}
    {state.view === 'library' && <Library/>}
    {state.view === 'practice' && <>
      {state.practicePicker && <div className="practice-kind" role="group" aria-label="Cách tập piano"><button aria-label="Free play" aria-pressed={state.practiceKind==='free'} onClick={run(()=>ws.selectPracticeKind('free'))}><Icon name="score"/><span>Free play<small>Chọn bài từ thư viện</small></span></button><button aria-label="Theo grade" aria-pressed={state.practiceKind==='grade'} onClick={run(()=>ws.selectPracticeKind('grade'))}><Icon name="piano"/><span>Theo grade<small>Đọc nhạc từ G1 đến G8</small></span></button></div>}
      {state.practiceKind==='grade' ? <Exercises/> : state.practicePicker || !state.snapshot || !state.config ? <PracticeHome/> : <Practice key={state.snapshot.fingerprint + ':' + state.snapshot.revision} snapshot={state.snapshot} config={state.config}/>}
    </>}
    {state.view === 'results' && state.result && <Results result={state.result}/>}
    {state.view === 'history' && <History/>}
    {state.busy && !state.tuneSelection && <div className="loading-overlay" role="status"><span className="brand-symbol">p</span><h2>{state.busy}</h2><div className="loading-bar"/><p>File được xử lý ngay trong trình duyệt.</p>{state.canCancelOpen && <button onClick={() => ws.cancelOpen()}>{state.cancelOpenLabel ?? 'Hủy mở file'}</button>}</div>}
    {state.tuneSelection && <TuneImportDialog key={state.tuneSelection.requestId} selection={state.tuneSelection}/>}
    {dragging && <div className="drop-overlay"><Icon name="upload"/><h2>Thả bản nhạc để mở</h2><p>ABC · MXL · MusicXML · MSCZ</p></div>}
    {state.toast && <div className="toast" role="status"><Icon name="check"/>{state.toast}</div>}
    <input id="file" ref={file} type="file" accept=".abc,.mxl,.xml,.musicxml,.mscz,.mscx" aria-label="Mở file bản nhạc" hidden onChange={e => {const f = e.target.files?.[0]; if (f) void ws.run(() => ws.importFile(f, practiceFile.current)); e.target.value = '';}}/>
    <dialog ref={exportDialog} aria-labelledby="export-title"><h2 id="export-title">Xuất bản nhạc</h2><label htmlFor="export-format">Định dạng</label><select id="export-format" value={format} onChange={e => setFormat(e.target.value)}><option value="mxl">MusicXML nén (.mxl)</option><option value="musicxml">MusicXML (.musicxml)</option><option value="pdf">PDF · bản in</option><option value="abc">ABC notation (.abc)</option></select><p>Xuất nội dung đang mở. MSCZ giữ đầy đủ thiết lập và dữ liệu MuseScore.</p>{format === 'abc' && <p className="abc-export-warning" role="note">ABC có thể thay đổi bố cục trang, font, khoảng cách và cách trình bày. Ứng dụng sẽ mở lại bản chuyển đổi để đối chiếu nốt, bè, nhịp, lặp, nhả phím và pedal; nếu không bảo toàn được sẽ dừng xuất và báo lý do.</p>}<div className="dialog-actions"><button onClick={() => exportDialog.current?.close()}>Hủy</button><button className="primary" onClick={run(() => {exportDialog.current?.close(); return ws.export(format);})}>Xuất file</button></div></dialog>
    <dialog ref={saveAsDialog} aria-labelledby="save-as-title"><h2 id="save-as-title">Lưu thành bản nhạc mới</h2><label htmlFor="copy-title">Tên trong thư viện</label><input id="copy-title" aria-label="Tên bản mới" autoFocus value={copyTitle} maxLength={150} onChange={e => setCopyTitle(e.target.value)}/><p>Bản mới có lịch sử luyện tập riêng. Các thay đổi và undo hiện tại của editor được giữ lại.</p><div className="dialog-actions"><button onClick={() => saveAsDialog.current?.close()}>Hủy</button><button className="primary" disabled={!copyTitle.trim()} onClick={run(async () => {await ws.saveAs(copyTitle); saveAsDialog.current?.close();})}>Lưu bản mới</button></div></dialog>
    <dialog ref={about}><h2>Pianist Web</h2><p>Editor dựa trên MuseScore Studio 4.7.5. Tập piano là chức năng riêng, sử dụng bản nhạc chỉ đọc.</p><p><a href="LICENSE.txt" target="_blank" rel="noreferrer">GPL v3</a> · <a href="practice-sources/piano-trainer-studio/LICENSE" target="_blank" rel="noreferrer">AGPL v3 · Wait</a> · <a href="https://github.com/ntduyliem-source/pianist/tree/pianist/m0-web" target="_blank" rel="noreferrer">Mã nguồn & hướng dẫn build</a></p><p className="muted">BPM dùng osu!mania; Đúng nốt dùng Piano Trainer Studio. Nhả phím và pedal dùng mir_eval, Magenta note-seq và mốc MuseScore. Chưa chấm half-pedal hoặc diễn cảm nâng cao. Tối ưu cho Chrome/Edge trên máy tính.</p><div className="dialog-actions"><button onClick={() => about.current?.close()}>Đóng</button></div></dialog>
  </div>;
}

function Library() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot), [search, setSearch] = useState(''), [trash, setTrash] = useState(false);
  const [offline, setOffline] = useState('');
  const projects = state.projects.filter(p => !!p.archived === trash && p.title.toLowerCase().includes(search.toLowerCase()));
  return <main className="library page">
    <aside className="library-sidebar"><div className="sidebar-label">KHÔNG GIAN CỦA BẠN</div><button className={!trash ? 'active' : ''} onClick={() => setTrash(false)}><Icon name="score"/>Bản nhạc của tôi<span>{state.projects.filter(p => !p.archived).length}</span></button><button onClick={() => ws.navigate('history')}><Icon name="history"/>Lịch sử luyện tập</button><button className={trash ? 'active' : ''} onClick={() => setTrash(true)}><Icon name="folder"/>Đã lưu trữ</button><div className="sidebar-bottom"><span className="small-logo">p</span><p>Soạn nhạc có chiều sâu.<br/>Tập đàn có mục tiêu.</p><span className="muted">MuseScore engine · MIDI input</span></div></aside>
    <section className="library-content"><div className="page-title"><div><div className="eyebrow">PIANIST WORKSPACE</div><h1 id="view-heading" tabIndex={-1}>{trash ? 'Bản nhạc đã lưu trữ' : 'Bản nhạc của bạn'}</h1><p>Nhập bản nhạc, chỉnh sửa và bước vào buổi tập của riêng bạn.</p></div><div className="button-row"><button onClick={run(() => ws.newProject())}><Icon name="add"/>Bản nhạc mới</button><button className="primary" onClick={() => ws.chooseFile()}><Icon name="upload"/>Nhập bản nhạc</button></div></div>
      {!trash && <div className="library-hero"><div><span className="hero-label">TỪ BẢN NHẠC ĐẾN PHÍM ĐÀN</span><h2>Mỗi nốt đúng.<br/>Mỗi nhịp vững hơn.</h2><p>Hai cách tập: chờ đúng nốt, hoặc giữ nhịp theo BPM.<br/>Bài tập luôn lấy từ phiên bản bạn vừa chỉnh sửa.</p><button onClick={run(() => ws.sample())}>Mở bài mẫu {state.exampleTitle} <Icon name="arrow"/></button></div><div className="hero-staff" aria-hidden="true"><div className="staff-lines"/><span className="clef">𝄞</span><span className="hero-note n1">♩</span><span className="hero-note n2">♪</span><span className="hero-note n3">♩</span><span className="hero-note n4">♫</span><div className="mini-keys">{Array.from({length: 13}, (_, i) => <i key={i} className={[1, 2, 4, 5, 6, 8, 9, 11, 12].includes(i) ? 'with-black' : ''}/>)}</div></div></div>}
      <div className="section-top"><h2>{trash ? 'Có thể khôi phục bất cứ lúc nào' : 'Gần đây'} <span>{projects.length}</span></h2><input type="search" aria-label="Tìm bản nhạc" placeholder="Tìm tên bản nhạc…" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="score-grid">{projects.map(project => <article className="score-card" key={project.id}><button className="score-cover" aria-label={'Mở ' + project.title} onClick={run(() => ws.openProject(project.id))}><Icon name="score"/><span>{project.title}</span><div className="cover-lines">━━━━━━━━━━<br/>━━━━━━━━━━<br/>━━━━━━━━━━</div></button><div className="score-card-body"><h3>{project.title}</h3><SourceLabel project={project}/><p>{date(project.updatedAt)} · {Math.round(project.bytes.length / 1024)} KB</p><div className="button-row">{trash ? <button onClick={run(() => ws.archive(project))}>Khôi phục</button> : <><button onClick={run(() => ws.openProject(project.id))}>Chỉnh sửa</button><button className="primary-light" onClick={run(() => ws.openProject(project.id, true))}><Icon name="play"/>Tập</button><button className="archive" title="Lưu trữ bài (có thể khôi phục)" aria-label={'Lưu trữ ' + project.title} onClick={run(() => ws.archive(project))}>···</button></>}</div></div></article>)}{!trash && <button className="import-card" onClick={() => ws.chooseFile()}><Icon name="upload"/><strong>Thêm bản nhạc</strong><span>Thả file vào đây hoặc chọn file</span><small>ABC · MXL · MusicXML · MSCZ · tối đa 32 MiB</small></button>}</div>
      {!trash && <BundledSongs search={search}/>}
      {!projects.length && search && !groupBundledScores(state.bundledScores).some(w=>matchesBundledWork(w,search)) && <p>Không tìm thấy bài phù hợp.</p>}
      <p className="storage-note">Thư viện và bản tự lưu nằm trong trình duyệt này. Tải MSCZ hoặc sao lưu cả thư viện để giữ trên máy.</p>
      <LibraryTransfer/>
      <div className="offline-controls"><button onClick={run(() => prepareOffline(setOffline))}>Chuẩn bị dùng offline</button><button onClick={run(async () => {await useOnline(); setOffline('Đã chuyển sang dùng online. Tải lại trang để áp dụng.');})}>Dùng online</button><span role="status">{offline}</span></div>
    </section>
  </main>;
}

function BundledSongs({search='',practice=false}:{search?:string;practice?:boolean}){
  const state=useSyncExternalStore(ws.subscribe,ws.snapshot),songs=useMemo(()=>groupBundledScores(state.bundledScores).filter(work=>matchesBundledWork(work,search)),[state.bundledScores,search]);
  if(!songs.length)return null;
  return <section className="bundled-library" aria-label="Bài hát có sẵn"><div className="section-top"><h2>Bài hát có sẵn <span>{songs.length}</span></h2><span className="muted">Mở một bài để lưu bản riêng trên thiết bị</span></div><div className="score-grid">{songs.map(work=><BundledSongCard key={work.id} work={work} practice={practice}/>)}</div></section>;
}

function BundledSongCard({work,practice}:{work:BundledWork;practice:boolean}){
  const preference='pianist-bundled-version:'+work.id;
  const [selected,setSelected]=useState(()=>{try{return localStorage.getItem(preference)??undefined;}catch{return undefined;}});
  const song=selectBundledVersion(work,selected),canPractice=song.practiceReady!==false;
  const choose=(id:string)=>{setSelected(id);try{localStorage.setItem(preference,id);}catch{/* Selecting remains available when storage is full or disabled. */}};
  return <article className="score-card" data-work-id={work.id}>
    <button className="score-cover" aria-label={'Mở bài có sẵn '+work.title} onClick={run(()=>ws.openBundledScore(song,practice&&canPractice))}>
      <Icon name="score"/><span>{work.title}</span><div className="cover-lines">━━━━━━━━━━<br/>━━━━━━━━━━<br/>━━━━━━━━━━</div>
    </button>
    <div className="score-card-body"><h3>{work.title}</h3><span className="source-label">MXL · Có sẵn</span>
      {work.versions.length>1&&<label className="bundled-version">Phiên bản<select aria-label={'Chọn phiên bản '+work.title} value={song.id} onChange={e=>choose(e.target.value)}>{work.versions.map(version=><option key={version.id} value={version.id}>{bundledVersionLabel(version)}</option>)}</select></label>}
      <p>{song.composer||'Bản piano'}</p>
      {!canPractice&&<p className="bundled-practice-notice" role="note">{song.practiceNotice}</p>}
      <div className="button-row"><button onClick={run(()=>ws.openBundledScore(song))}>Chỉnh sửa</button><button className="primary-light" disabled={!canPractice} title={canPractice?undefined:song.practiceNotice} onClick={run(()=>ws.openBundledScore(song,true))}><Icon name="play"/>Tập</button></div>
    </div>
  </article>;
}

function PracticeHome() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot), [search, setSearch] = useState('');
  const projects = state.projects.filter(p => !p.archived && p.title.toLowerCase().includes(search.toLowerCase()));
  return <main className="practice-home page">
    <section className="library-content">
      <div className="page-title">
        <div><div className="eyebrow">PIANO PRACTICE</div><h1 id="view-heading" tabIndex={-1}>Chọn bài để tập</h1><p>Mở bài trong thư viện hoặc nhập bản nhạc để bắt đầu.</p></div>
        <button className="primary" onClick={() => ws.chooseFile(true)}><Icon name="upload"/>Nhập bản nhạc để tập</button>
      </div>
      {state.current && <div className="practice-current"><div><span className="eyebrow">BẢN NHẠC ĐANG MỞ</span><strong>{state.current.title}</strong></div><button className="primary-light" onClick={run(() => ws.practice())}><Icon name="play"/>Tập bài đang mở</button></div>}
      <div className="section-top"><h2>Bài trong thư viện <span>{projects.length}</span></h2><input type="search" aria-label="Tìm bài để tập" placeholder="Tìm tên bản nhạc…" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="score-grid">{projects.map(project => <article className="score-card" key={project.id}>
        <button className="score-cover" aria-label={'Tập ' + project.title} onClick={run(() => ws.openProject(project.id, true))}><Icon name="score"/><span>{project.title}</span><div className="cover-lines">━━━━━━━━━━<br/>━━━━━━━━━━<br/>━━━━━━━━━━</div></button>
        <div className="score-card-body"><h3>{project.title}</h3><SourceLabel project={project}/><p>{date(project.updatedAt)} · {Math.round(project.bytes.length / 1024)} KB</p><button className="primary-light" aria-label={'Bắt đầu với ' + project.title} onClick={run(() => ws.openProject(project.id, true))}><Icon name="play"/>Tập bài này</button></div>
      </article>)}</div>
      <BundledSongs search={search} practice/>
      {!projects.length && !groupBundledScores(state.bundledScores).some(w=>matchesBundledWork(w,search)) && <p className="practice-empty">{search ? 'Không tìm thấy bài phù hợp.' : 'Thư viện chưa có bài. Nhập file hoặc thử bài mẫu để bắt đầu.'}</p>}
      <p className="storage-note">Màn tập sử dụng bản nhạc chỉ đọc. ABC · MXL · MusicXML · MSCZ · tối đa 32 MiB.</p>
    </section>
  </main>;
}

createRoot(document.getElementById('app')!).render(<App/>);
