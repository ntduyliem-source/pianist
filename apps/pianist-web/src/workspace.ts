import { EngineBridge, type NativeApi } from '../../../packages/engine-bridge/index';
import { defaultConfig } from '../../../packages/practice-core/plan';
import { ALGORITHM_VERSION, type ScoreSnapshot, type SessionConfig, type SessionResult } from '../../../packages/score-contracts/index';
import { download, fingerprint, validateFile } from './platform/files';
import { MidiRouter } from './platform/midi';
import * as storage from './platform/storage';
import { PracticeSession } from './practice/session';
import { loadEngineAssets } from './platform/engine-assets';

type View = 'library' | 'editor' | 'practice' | 'results' | 'history';
export interface WorkspaceState {
  view: View; busy: string; error: string; toast: string; projects: storage.ProjectRecord[]; history: SessionResult[];
  current?: storage.ProjectRecord; snapshot?: ScoreSnapshot; config?: SessionConfig; result?: SessionResult;
  revision: number; savedRevision: number; recoveryRevision: number; saveState: string; engineReady: boolean; midiVersion: number;
  exampleTitle: string;
  practicePicker: boolean;
  canCancelOpen?: boolean;
  engineFailed?: boolean;
}
export class Workspace {
  state: WorkspaceState = {view: 'library', busy: '', error: '', toast: '', projects: [], history: [], revision: 0, savedRevision: 0, recoveryRevision: 0, saveState: '', engineReady: false, midiVersion: 0, exampleTitle: 'Piano khởi động', practicePicker: true};
  bridge?: EngineBridge; session?: PracticeSession; readonly midi = new MidiRouter();
  private listeners = new Set<() => void>(); private engineLoading?: Promise<EngineBridge>; private loadingDocument = false;
  private nativeBase = 0; private revisionBase = 0; private nativeRevision = 0; private autosaveTimer?: number; private leaseTimer?: number; private toastTimer?: number;
  private operation = 0; private fileAbort?: AbortController; private source?: {bytes: Uint8Array; filename: string}; private recovery?: storage.RecoveryRecord;
  private autosaving?: Promise<void>;
  private documentChange?: symbol;
  private diagnosticSamples: object[] = [];
  chooseFile: (practice?: boolean) => void = () => {}; showExport: () => void = () => {}; showAbout: () => void = () => {}; showSaveAs: () => void = () => {};
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => this.listeners.delete(listener);};
  snapshot = () => this.state;
  patch(patch: Partial<WorkspaceState>): void {this.state = {...this.state, ...patch}; this.listeners.forEach(fn => fn());}
  notice(message: string): void {this.patch({toast: message}); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.patch({toast: ''}), 5000);}
  private diagnostic(message: string): void {const status = document.getElementById('status'); if (status) status.textContent = message;}
  private measureDiagnostic(operation: string, started: number, details: object = {}): void {
    if (!new URLSearchParams(location.search).has('diagnostics')) return;
    const jsMemory = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory;
    this.diagnosticSamples.push({operation, elapsedMs: Math.round(performance.now() - started),
      wasmHeapBytes: this.bridge?.api.Module.HEAPU8?.byteLength ?? null, jsUsedHeapBytes: jsMemory?.usedJSHeapSize ?? null, ...details});
    this.diagnosticSamples = this.diagnosticSamples.slice(-12);
    const log = document.getElementById('log'); if (log) log.textContent = JSON.stringify(this.diagnosticSamples);
  }
  fail(e: unknown): void {
    console.error(e);
    if (e instanceof WebAssembly.RuntimeError) {
      clearTimeout(this.autosaveTimer); this.session?.pause('Engine ký âm bị gián đoạn.', true);
      this.patch({engineFailed: true, busy: '', canCancelOpen: false});
    }
    const message = this.state.engineFailed ? 'MuseScore bị gián đoạn. Tải lại trang để mở bản đã lưu gần nhất; thư viện và bản tự lưu đã ghi vẫn được giữ.' : storage.storageError(e);
    this.diagnostic('Lỗi: ' + message); this.patch({error: message});
  }
  async run(action: () => unknown | Promise<unknown>): Promise<void> {try {if (this.state.engineFailed) return; await action();} catch (e) {this.fail(e);} finally {this.focusEditor();}}
  async init(): Promise<void> {
    const catalog = await fetch('examples/catalog.json').then(r => r.ok ? r.json() : null).catch(() => null);
    if (catalog?.examples?.[0]?.title) this.patch({exampleTitle: catalog.examples[0].title});
    history.replaceState(null, '', location.pathname + location.search + '#/library');
    window.addEventListener('hashchange', () => {
      const view = location.hash.slice(2) as View;
      if (view === this.state.view) return;
      if (['library', 'editor', 'practice', 'results', 'history'].includes(view)) {
        if (view === 'editor' && !this.state.current) void this.run(() => this.openEditor());
        else if (view === 'practice' && !this.state.snapshot) this.openPractice();
        else if (view === 'results' && !this.state.result) this.navigate('library');
        else this.navigate(view);
      }
    });
    try {await this.refresh();
      const recoveries = await storage.list<storage.RecoveryRecord>('recovery');
      this.recovery = recoveries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (this.recovery) this.notice('Có bản tự lưu. Mở bài trong thư viện sẽ phục hồi các thay đổi gần nhất.');
    } catch (e) {this.fail(e);}
    this.midi.onChange = () => this.patch({midiVersion: this.state.midiVersion + 1});
    this.midi.onDisconnect = () => {this.session?.pause('Đàn MIDI đã ngắt kết nối. Kết nối/chọn lại thiết bị rồi Tiếp tục.', true); this.notice('Thiết bị MIDI đã ngắt kết nối.');};
    this.midi.onReset = () => {this.session?.pause('Đàn gửi lệnh xóa trạng thái phím. Nhả phím rồi bấm Tiếp tục.', true);};
    this.midi.onInput = (e, bytes) => {
      if (this.state.engineFailed) return;
      if (this.state.view === 'editor') this.bridge?.api.midiInput(bytes[0], bytes[1], bytes[2]);
      if (this.state.view === 'practice') {
        if (e.source === 'virtual') this.session?.transport.tone(e.pitch, e.type === 'on');
        this.session?.input(e);
      }
    };
    document.addEventListener('visibilitychange', () => {if (document.hidden) {this.session?.pause('Tab đã bị ẩn. Tiếp tục sẽ đếm vào lại.', true); this.midi.release(); void this.autosave();}});
    window.addEventListener('blur', () => {this.midi.release(); this.session?.pause('Cửa sổ mất focus. Tiếp tục sẽ đếm vào lại.', true);});
    window.addEventListener('beforeunload', e => {if (this.state.current && this.state.recoveryRevision < this.state.revision) {e.preventDefault(); e.returnValue = '';}});
    window.addEventListener('pagehide', () => {if (this.state.current) void storage.releaseProject(this.state.current.id);});
    window.addEventListener('pageshow', e => {if (e.persisted && this.state.current) void this.run(() => storage.claimProject(this.state.current!.id));});
  }
  async refresh(): Promise<void> {
    const [projects, history] = await Promise.all([storage.list<storage.ProjectRecord>('projects'), storage.list<SessionResult>('sessions')]);
    this.patch({projects: projects.sort((a, b) => b.updatedAt - a.updatedAt), history: history.sort((a, b) => b.createdAt - a.createdAt)});
  }
  focusEditor = (element?: Element): void => {
    if (this.state.engineFailed || this.state.view !== 'editor' || document.querySelector('dialog[open]')) return;
    const root = document.querySelector('#screen #qt-shadow-container')?.shadowRoot;
    const win = element ?? root?.querySelector('.qt-decorated-window:not(.inactive) .qt-window');
    if (win && !win.contains(root?.activeElement ?? null)) (win.querySelector('.qt-window-focus-helper') as HTMLElement)?.focus({preventScroll: true});
  };
  async ensureEngine(): Promise<EngineBridge> {
    if (this.state.engineFailed) throw Error('Tải lại trang để khởi động lại MuseScore.');
    if (this.bridge) return this.bridge;
    if (this.engineLoading) return this.engineLoading;
    this.patch({busy: 'Đang tải MuseScore… Lần đầu cần tải bộ ký âm và tiếng piano.'});
    this.engineLoading = (async () => {
      const started = performance.now();
      const wasmBinary = await loadEngineAssets();
      const url = new URL('distr/muapi.js', location.href).href;
      const createMuApi = (await import(/* @vite-ignore */ url)).default;
      const api: NativeApi = await createMuApi({screen: document.getElementById('screen'), wasmBinary,
        onWebCommand: (command: string) => {
          if (this.state.view !== 'editor') return;
          void this.run(() => command === 'new' ? this.newProject() : command === 'open' ? this.chooseFile() : command === 'save' ? this.saveLibrary() : command === 'save-as' ? this.showSaveAs() : command === 'export' ? this.showExport() : this.showAbout());
        },
        onDocumentState: (title: string, modified: boolean) => {
          document.title = `${title}${modified ? ' *' : ''} — Pianist`;
          const screen = document.getElementById('screen'); if (screen) screen.dataset.modified = String(modified);
        },
        onRevisionChanged: (revision: number) => {
          this.nativeRevision = revision; if (this.bridge) this.bridge.revision = revision;
          if (!this.loadingDocument && this.state.current && this.bridge) {
            const logical = this.revisionBase + revision - this.nativeBase;
            this.patch({revision: logical, saveState: 'Đang chờ tự lưu…'});
            clearTimeout(this.autosaveTimer); this.autosaveTimer = window.setTimeout(() => void this.autosave(), 1600);
          }
        },
        onExit: (data: {text?: string}) => {this.patch({engineFailed: true}); this.fail(Error('Engine đã dừng: ' + (data.text ?? 'Hãy tải lại trang.')));},
        onProjectSaved: (bytes: Uint8Array) => download(bytes, `${this.state.current?.title ?? 'score'}.mscz`),
        onMxlExported: (bytes: Uint8Array) => download(bytes, `${this.state.current?.title ?? 'score'}.mxl`),
        onXmlExported: (bytes: Uint8Array) => download(bytes, `${this.state.current?.title ?? 'score'}.musicxml`, 'application/xml'),
        onPdfExported: (bytes: Uint8Array) => download(bytes, `${this.state.current?.title ?? 'score'}.pdf`, 'application/pdf'),
      });
      this.bridge = new EngineBridge(api); this.bridge.revision = this.nativeRevision;
      if (new URLSearchParams(location.search).has('diagnostics')) (window as any).pianist = api;
      await api.startAudioProcessing();
      this.measureDiagnostic('engine-ready', started);
      document.getElementById('screen')!.addEventListener('pointerdown', e => {api.Module.driver?.resume(); this.focusEditor(e.composedPath().find((x: any) => x.classList?.contains('qt-window')) as Element);}, true);
      this.patch({engineReady: true}); return this.bridge;
    })();
    try {return await this.engineLoading;} catch (e) {this.engineLoading = undefined; throw e;}
  }
  private async switchDocument(record: storage.ProjectRecord, data: Uint8Array, filename: string, durable = true): Promise<void> {
    await storage.claimProject(record.id);
    const old = this.state.current;
    try {
      const bridge = await this.ensureEngine();
      this.loadingDocument = true; bridge.setPractice(false);
      const started = performance.now();
      if (!bridge.api.loadScoreData(data, filename)) throw Error('Không mở được bản nhạc. Bài đang mở vẫn được giữ.');
      this.measureDiagnostic('native-import', started, {inputBytes: data.length});
      this.nativeBase = bridge.revision; this.revisionBase = record.revision;
      this.source = {bytes: record.source ?? data, filename: record.sourceName ?? filename};
      if (old && old.id !== record.id) await storage.releaseProject(old.id);
      this.patch({current: record, revision: record.revision, savedRevision: durable ? record.revision : 0,
        recoveryRevision: durable ? record.revision : 0, saveState: durable ? 'Đã lưu trong thư viện' : 'Chưa lưu trong thư viện', snapshot: undefined, config: undefined});
      clearInterval(this.leaseTimer); this.leaseTimer = window.setInterval(() => {const id = this.state.current?.id; if (id) void storage.claimProject(id).catch(e => {this.session?.pause('Tab khác đã giữ quyền ghi bài này.', true); this.fail(e); this.navigate('library');});}, 5000);
    } catch (e) {if (old?.id !== record.id) await storage.releaseProject(record.id); throw e;}
    finally {this.loadingDocument = false;}
  }
  private requireInactiveSession(): void {
    if (this.session && !['ready', 'finished'].includes(this.session.status)) throw Error('Kết thúc lượt tập trước khi mở hoặc đổi bản nhạc.');
  }
  private async changeDocument(action: () => Promise<void>): Promise<void> {
    this.requireInactiveSession();
    if (this.documentChange) throw Error('Đang xử lý một bản nhạc. Hãy chờ hoàn tất hoặc hủy mở file.');
    const owner = this.documentChange = Symbol(); this.patch({busy: 'Đang chuẩn bị bản nhạc…'});
    try {await action();}
    finally {if (this.documentChange === owner) {this.documentChange = undefined; this.patch({busy: '', canCancelOpen: false});}}
  }
  async openEditor(): Promise<void> {
    this.requireInactiveSession();
    if (this.state.current && this.bridge) this.navigate('editor');
    else await this.newProject();
  }
  openPractice(): void {
    // Selecting the practice feature does not require a loaded editor document.
    // Keep an in-progress session intact when its own navbar item is pressed.
    if (this.session && !['ready', 'finished'].includes(this.session.status)) return;
    this.patch({practicePicker: true});
    this.navigate('practice');
  }
  async newProject(): Promise<void> {
    return this.changeDocument(() => this.createNewProject());
  }
  private async createNewProject(): Promise<void> {
    this.requireInactiveSession();
    await this.autosave(true); this.patch({busy: 'Đang tạo bản nhạc…'});
    try {
      const response = await fetch('templates/blank-piano.mscz'); if (!response.ok) throw Error('Không tải được mẫu piano.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const record: storage.ProjectRecord = {id: crypto.randomUUID(), title: 'Bản nhạc mới', filename: 'Bản nhạc mới.mscz', bytes, revision: 1, createdAt: Date.now(), updatedAt: Date.now()};
      await this.switchDocument(record, bytes, record.filename, false); this.navigate('editor');
      await storage.saveProject(record); this.patch({savedRevision: record.revision, recoveryRevision: record.revision, saveState: 'Đã lưu trong thư viện'}); await this.refresh();
    } finally {this.patch({busy: ''});}
  }
  async importFile(file: File, practice = false): Promise<void> {
    return this.changeDocument(() => this.importDocument(file, practice));
  }
  private async importDocument(file: File, practice: boolean): Promise<void> {
    this.requireInactiveSession();
    if (!file) return; this.diagnostic('Đang mở ' + file.name + '…'); await this.autosave(true); const token = ++this.operation;
    this.fileAbort?.abort(); this.fileAbort = new AbortController();
    this.patch({busy: 'Đang kiểm tra và mở ' + file.name + '…', canCancelOpen: true});
    try {
      if (file.size > 32 * 1024 * 1024) throw Error('File vượt giới hạn 32 MiB.');
      const data = new Uint8Array(await file.arrayBuffer()); await validateFile(data, file.name, this.fileAbort.signal);
      if (token !== this.operation) return;
      await this.ensureEngine();
      if (token !== this.operation) return;
      this.patch({busy: 'Đang nhập bản nhạc vào MuseScore…', canCancelOpen: false});
      const record: storage.ProjectRecord = {id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), filename: file.name, bytes: data, source: data, sourceName: file.name, revision: 1, createdAt: Date.now(), updatedAt: Date.now()};
      await this.switchDocument(record, data, file.name, false);
      if (!practice) this.navigate('editor');
      record.bytes = this.bridge!.serialize(); record.filename = `${record.title}.mscz`;
      await storage.saveProject(record); this.patch({current: record, savedRevision: record.revision, recoveryRevision: record.revision, saveState: 'Đã lưu trong thư viện'}); await this.refresh(); this.notice('Đã nhập bài và giữ bản nguồn trong thư viện.');
      this.diagnostic('Đã mở ' + file.name + '.');
      if (practice) await this.practice();
    } catch (error) {if (token === this.operation) throw error;}
    finally {if (token === this.operation) this.patch({busy: '', canCancelOpen: false});}
  }
  cancelOpen(): void {if (!this.state.canCancelOpen) return; ++this.operation; this.documentChange = undefined; this.fileAbort?.abort(); this.bridge?.cancel(); this.patch({busy: '', canCancelOpen: false});}
  async openProject(id: string, practice = false): Promise<void> {
    return this.changeDocument(() => this.openStoredProject(id, practice));
  }
  private async openStoredProject(id: string, practice = false): Promise<void> {
    this.requireInactiveSession();
    if (this.state.current?.id === id && this.bridge) {if (practice) await this.practice(); else this.navigate('editor'); return;}
    await this.autosave(true); this.patch({busy: 'Đang mở bản nhạc…'});
    try {
      const record = await storage.get<storage.ProjectRecord>('projects', id); if (!record) throw Error('Không tìm thấy bài trong thư viện.');
      const recovery = await storage.get<storage.RecoveryRecord>('recovery', id);
      const useRecovery = recovery && (recovery.revision > record.revision || recovery.revision === record.revision && recovery.updatedAt > record.updatedAt);
      const loaded = useRecovery ? {...record, revision: recovery.revision, title: recovery.title} : record;
      await this.switchDocument(loaded, useRecovery ? recovery.bytes : record.bytes, useRecovery ? recovery.filename : record.filename);
      if (useRecovery) {this.patch({savedRevision: record.revision, saveState: 'Đã phục hồi bản tự lưu'}); this.notice('Đã phục hồi thay đổi gần nhất. Bấm Lưu thư viện để giữ bản này.');}
      if (practice) await this.practice(); else this.navigate('editor');
    } finally {this.patch({busy: ''});}
  }
  async sample(practice = false): Promise<void> {
    const catalog = await fetch('examples/catalog.json').then(r => r.ok ? r.json() : null).catch(() => null);
    const example = catalog?.examples?.[0] ?? {url: 'fixtures/piano.mxl', filename: 'Piano khởi động.mxl'};
    const response = await fetch(example.url); if (!response.ok) throw Error('Không tải được bài mẫu.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const existing = this.state.projects.find(p => !p.archived && p.sourceName === example.filename
      && p.source?.length === bytes.length && p.source.every((byte, i) => byte === bytes[i]));
    if (existing) {await this.openProject(existing.id, practice); return;}
    await this.importFile(new File([bytes], example.filename), practice);
  }
  async saveLibrary(): Promise<void> {
    await this.autosaving; clearTimeout(this.autosaveTimer);
    if (!this.state.current || !this.bridge) return;
    const revision = this.state.revision, bytes = this.bridge.serialize();
    const record = {...this.state.current, bytes, filename: `${this.state.current.title}.mscz`, revision, updatedAt: Date.now()};
    await storage.saveProject(record);
    if (this.state.current?.id === record.id) this.patch({current: record, savedRevision: revision, recoveryRevision: revision, saveState: 'Đã lưu trong thư viện'});
    await this.refresh(); this.notice('Đã lưu bản nhạc trong thư viện trên thiết bị này.');
  }
  async saveAs(title: string): Promise<void> {
    return this.changeDocument(() => this.saveCopy(title));
  }
  private async saveCopy(title: string): Promise<void> {
    this.requireInactiveSession();
    await this.autosave(true); if (!this.state.current || !this.bridge || !title.trim()) return;
    const old = this.state.current, bridge = this.bridge, bytes = bridge.serialize();
    const record: storage.ProjectRecord = {...old, id: crypto.randomUUID(), title: title.trim().slice(0, 150), bytes,
      revision: 1, createdAt: Date.now(), updatedAt: Date.now(), archived: false};
    record.filename = record.title + '.mscz'; await storage.claimProject(record.id);
    try {await storage.saveProject(record);} catch (e) {await storage.releaseProject(record.id); throw e;}
    await storage.releaseProject(old.id); this.nativeBase = bridge.revision; this.revisionBase = 1;
    this.patch({current: record, revision: 1, savedRevision: 1, recoveryRevision: 1, saveState: 'Đã lưu bản mới', snapshot: undefined, config: undefined});
    await this.refresh(); this.notice('Đã lưu bản mới. Nội dung và undo của editor được giữ nguyên.');
  }
  async autosave(strict = false): Promise<void> {
    if (this.autosaving) {await this.autosaving; if (this.state.recoveryRevision < this.state.revision) return this.autosave(strict); return;}
    if (this.state.engineFailed || this.loadingDocument || !this.state.current || !this.bridge || this.state.recoveryRevision >= this.state.revision) return;
    const current = this.state.current, bridge = this.bridge;
    clearTimeout(this.autosaveTimer);
    const operation = (async () => {
      const revision = this.state.revision, record: storage.RecoveryRecord = {id: current.id, title: current.title,
        filename: `${current.title}.mscz`, revision, bytes: bridge.serialize(), updatedAt: Date.now()};
      await storage.saveProject(record, true);
      if (this.state.current?.id === record.id) this.patch({recoveryRevision: revision, saveState: 'Đã tự lưu · ' + new Date(record.updatedAt).toLocaleTimeString('vi', {hour: '2-digit', minute: '2-digit'})});
    })();
    this.autosaving = operation;
    try {await operation;}
    catch (e) {this.patch({saveState: 'Chưa lưu được'}); this.fail(e); if (strict) throw e;}
    finally {if (this.autosaving === operation) this.autosaving = undefined;}
  }
  downloadProject(): void {if (this.bridge && this.state.current) {download(this.bridge.serialize(), `${this.state.current.title}.mscz`); this.notice('Đã tải bản sao MSCZ.');}}
  export(format: string): void {if (!this.bridge?.api.exportScore(format)) throw Error('Không xuất được định dạng này.');}
  async practice(overrides?: Partial<SessionConfig>): Promise<void> {
    if (!this.state.current || !this.bridge) {this.openPractice(); return;}
    if (this.session && !['ready', 'finished'].includes(this.session.status)) throw Error('Kết thúc lượt tập trước khi thay đổi bản nhạc.');
    this.session?.dispose(); this.session = undefined;
    this.patch({busy: 'Đang tạo bản nhạc luyện chỉ đọc…'});
    try {
      this.midi.release();
      // Drain the native MIDI input timer and pending layout before taking the immutable snapshot.
      await new Promise<void>(resolve => setTimeout(resolve, 40));
      await this.autosave(true); this.bridge.setPractice(true);
      const started = performance.now();
      const snapshot = await this.bridge.cancellableSnapshot(this.state.current.id, fingerprint); snapshot.revision = this.state.revision;
      this.measureDiagnostic('practice-snapshot', started, {pages: snapshot.pages.length, anchors: snapshot.anchors.length});
      const calibration = await storage.get<{id: string; offsetMs: number}>('settings', 'calibration:' + this.midi.deviceId);
      const prior = this.state.snapshot?.fingerprint === snapshot.fingerprint ? this.state.config : undefined;
      const config = {...defaultConfig(snapshot), ...prior, ...overrides};
      config.algorithmVersion = ALGORITHM_VERSION; // Retrying old history creates a new result with the current grader.
      config.fromMeasure = Math.max(0, Math.min(snapshot.measures.length - 1, config.fromMeasure));
      config.toMeasure = Math.max(config.fromMeasure, Math.min(snapshot.measures.length - 1, config.toMeasure));
      config.deviceId = this.midi.deviceId; config.inputSource = this.midi.deviceId === 'virtual' ? 'virtual' : 'midi'; config.offsetMs = overrides?.offsetMs ?? prior?.offsetMs ?? calibration?.offsetMs ?? 0;
      this.patch({snapshot, config, practicePicker: snapshot.anchors.length === 0}); this.navigate('practice');
      if (!snapshot.anchors.length) this.notice('Bản nhạc đang mở chưa có nốt. Chọn hoặc nhập một bài để tập.');
    } catch (e) {this.bridge.setPractice(false); throw e;}
    finally {this.patch({busy: ''});}
  }
  navigate(view: View): void {
    if (this.state.engineFailed) return;
    if (this.session && !['ready', 'finished'].includes(this.session.status) && view !== 'practice') {
      this.notice('Bấm Kết thúc lượt tập trước khi chuyển màn hình.'); return;
    }
    this.midi.release();
    if (view === 'editor') this.bridge?.setPractice(false); else if (this.bridge) this.bridge.setPractice(true);
    this.patch({view}); location.hash = '/' + view;
    const screen = document.getElementById('screen')!; screen.inert = view !== 'editor'; screen.setAttribute('aria-hidden', String(view !== 'editor'));
    document.body.dataset.view = view;
    if (view === 'editor') requestAnimationFrame(() => {window.dispatchEvent(new Event('resize')); this.focusEditor();});
    else (document.getElementById('view-heading') as HTMLElement)?.focus({preventScroll: true});
  }
  async recordResult(result: SessionResult, keepReplay = false): Promise<void> {
    if (keepReplay && this.session?.replayComplete) result.replay = {events: this.session.events, plan: this.session.plan, commands: this.session.commands};
    try {await storage.saveSession(result); await this.refresh();}
    catch (e) {this.fail(e); this.notice('Chưa lưu được kết quả. Có thể tải JSON để giữ lại.');}
    this.patch({result}); this.navigate('results');
  }
  async rename(title: string): Promise<void> {
    this.requireInactiveSession();
    if (!this.state.current || !title.trim()) return;
    this.patch({current: {...this.state.current, title: title.trim().slice(0, 150)}, revision: this.state.revision + 1});
    this.revisionBase += 1; await this.saveLibrary();
  }
  async archive(record: storage.ProjectRecord): Promise<void> {
    await storage.claimProject(record.id);
    const latest = await storage.get<storage.ProjectRecord>('projects', record.id);
    if (!latest) throw Error('Không tìm thấy bản nhạc.');
    await storage.saveProject({...latest, archived: !latest.archived}, false, false);
    if (this.state.current?.id === record.id) this.patch({current: {...this.state.current, archived: !latest.archived}});
    if (this.state.current?.id !== record.id) await storage.releaseProject(record.id); await this.refresh();
  }
}
export const workspace = new Workspace();
