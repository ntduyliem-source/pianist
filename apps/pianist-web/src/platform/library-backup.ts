import {Unzip, UnzipInflate, zip, strToU8, strFromU8} from 'fflate';
import type {LibraryData, ProjectRecord, RecoveryRecord} from './storage';
import type {SavedAttempt} from '../../../../packages/practice-engine-v2/model';
import {validateFile} from './files';

const LIMIT = 256 * 1024 * 1024;
type FileRef = {path: string; bytes: number; sha256: string};
type SavedProject = Omit<ProjectRecord, 'bytes' | 'source'> & {data: FileRef; sourceData?: FileRef};
type SavedRecovery = Omit<RecoveryRecord, 'bytes'> & {data: FileRef};
interface Manifest {format: 'pianist-library'; version: 1; createdAt: number; projects: SavedProject[]; recovery: SavedRecovery[]; sessions: FileRef; settings: FileRef}
export interface LibraryBackup {createdAt: number; data: LibraryData; bytes: number}
const hash = async (data: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice().buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 500): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const number = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function fail(): never {throw Error('Gói sao lưu không hợp lệ hoặc bị hỏng. Thư viện hiện tại được giữ nguyên.');}
function metadata(record: unknown): asserts record is SavedProject {
  if (!object(record) || !text(record.id) || !text(record.title, 4096) || !text(record.filename, 4096)
    || !Number.isSafeInteger(record.revision) || record.revision < 0 || !number(record.updatedAt)) fail();
}
function resultValid(r: any): r is SavedAttempt {
  if (!object(r) || !text(r.id) || !text(r.projectId) || !text(r.title,4096) || !number(r.createdAt)) return false;
  // Archived JSON is read-only data; no old evaluator or replay is loaded.
  if (r.schemaVersion === 1) return true;
  if (r.schemaVersion !== 2 || !text(r.engine) || !object(r.settings) || r.settings.version!==2
    || !object(r.timeline) || r.timeline.projectId!==r.projectId || !object(r.metrics)
    || !['complete','aborted','interrupted'].includes(r.outcome)) return false;
  for (const name of ['judgements','extras','intervals','faults']) if(!Array.isArray(r[name]) || r[name].length>250000) return false;
  if(!Array.isArray(r.timeline.targets) || r.timeline.targets.length>100000) return false;
  const ids=new Set(r.timeline.targets.map((t:any)=>t?.id));
  if(ids.size!==r.timeline.targets.length || !r.timeline.targets.every((t:any)=>object(t)&&text(t.id)&&number(t.atMs)&&number(t.pitch)&&number(t.measure)&&Array.isArray(t.anchors)))return false;
  if(!r.judgements.every((j:any)=>object(j)&&ids.has(j.id)&&['miss','meh','ok','good','great','perfect'].includes(j.grade)&&number(j.delta)&&number(j.at)))return false;
  if(!['accuracy','coverage','precision','medianAbsMs','p90AbsMs','signedMeanMs'].every(k=>r.metrics[k]===null||number(r.metrics[k])))return false;
  if(!text(r.fingerprint)||!number(r.revision)||!number(r.elapsedMs)||!['wait','bpm'].includes(r.settings.mode)||!number(r.settings.bpm))return false;
  if(!r.faults.every((f:unknown)=>typeof f==='string'))return false;
  if(r.replay && (!object(r.replay)||r.replay.engine!==r.engine||!Array.isArray(r.replay.commands)||r.replay.commands.length>400000))return false;
  if(r.r4!==undefined){
    const a=r.r4;
    if(!object(a)||a.profile!=='mir_eval-offset+note-seq+pedal-200ms'||!object(a.pedal))return false;
    for(const list of [a.key,a.sound])if(!Array.isArray(list)||list.length>100000||!list.every((n:any)=>object(n)&&ids.has(n.id)
      &&['correct','early','late','unreleased','interrupted','no-attack','unavailable','pending'].includes(n.status)
      &&['expectedMs','actualMs','deltaMs','toleranceMs'].every(k=>n[k]===null||number(n[k]))))return false;
    const p=a.pedal;
    if(!['scored','disabled','no-reference','wait','partial'].includes(p.status)||!['reference','performed','interrupted','precision','recall','f1','overlap'].every(k=>number(p[k]))
      ||!Array.isArray(p.targets)||p.targets.length>100000||!p.targets.every((t:any)=>object(t)&&text(t.id)&&number(t.atMs)&&number(t.endMs)&&t.endMs>t.atMs&&number(t.loop))
      ||!Array.isArray(p.intervals)||p.intervals.length>250000||!p.intervals.every((i:any)=>object(i)&&number(i.onMs)&&number(i.offMs)&&i.offMs>i.onMs)
      ||!Array.isArray(p.matching)||p.matching.length>100000||!p.matching.every((m:any)=>Array.isArray(m)&&m.length===2&&Number.isInteger(m[0])&&m[0]>=0&&m[0]<p.targets.length&&Number.isInteger(m[1])&&m[1]>=0&&m[1]<p.intervals.length))return false;
    if(!Array.isArray(r.pedalIntervals)||r.pedalIntervals.length>250000||!Array.isArray(r.controls)||r.controls.length>250000)return false;
  }
  return ['planned','evaluated','hits','misses','extras'].every(k=>number(r.metrics[k])&&r.metrics[k]>=0);
}

export async function encodeLibrary(data: LibraryData): Promise<Uint8Array> {
  if (data.projects.length > 1000 || data.recovery.length > 1000 || data.sessions.length > 10000 || data.settings.length > 10000) throw Error('Gói sao lưu vượt giới hạn 1.000 bài hoặc 10.000 lượt tập/thiết lập.');
  const files: Record<string, Uint8Array> = {}; let total = 0;
  const add = async (path: string, bytes: Uint8Array): Promise<FileRef> => {
    total += bytes.length; if (total > LIMIT) throw Error('Thư viện vượt giới hạn sao lưu 256 MiB. Hãy tải riêng các bài lớn.');
    files[path] = bytes; return {path, bytes: bytes.length, sha256: await hash(bytes)};
  };
  const projects: SavedProject[] = [], recovery: SavedRecovery[] = [];
  for (const [i, project] of data.projects.entries()) {
    const {bytes, source, ...meta} = project;
    projects.push({...meta, data: await add(`projects/${i}.mscz`, bytes), ...(source ? {sourceData: await add(`sources/${i}.bin`, source)} : {})});
  }
  for (const [i, item] of data.recovery.entries()) {const {bytes, ...meta} = item; recovery.push({...meta, data: await add(`recovery/${i}.mscz`, bytes)});}
  const manifest: Manifest = {format: 'pianist-library', version: 1, createdAt: Date.now(), projects, recovery,
    sessions: await add('sessions.json', strToU8(JSON.stringify(data.sessions))), settings: await add('settings.json', strToU8(JSON.stringify(data.settings)))};
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  if (files['manifest.json'].length > 4 * 1024 * 1024 || total + files['manifest.json'].length > LIMIT) throw Error('Dữ liệu và danh mục sao lưu vượt giới hạn 256 MiB.');
  return new Promise((resolve, reject) => zip(files, {level: 1}, (error, bytes) => {
    if (error) reject(error);
    else if (bytes.length > LIMIT) reject(Error('Gói sao lưu vượt giới hạn 256 MiB.'));
    else resolve(bytes);
  }));
}

async function boundedUnzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (!bytes.length || bytes.length > LIMIT) throw Error('Gói sao lưu phải nhỏ hơn 256 MiB.');
  const entries = new Map<string, Uint8Array>(), names = new Set<string>(); let total = 0;
  const stream = new Unzip(file => {
    if (names.has(file.name) || names.size >= 4003 || !/^(manifest\.json|sessions\.json|settings\.json|(?:projects|sources|recovery)\/\d+\.(?:mscz|bin))$/.test(file.name)) fail();
    names.add(file.name);
    const chunks: Uint8Array[] = []; let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      total += chunk.length; size += chunk.length;
      if (total > LIMIT || file.name === 'manifest.json' && size > 4 * 1024 * 1024) throw Error('Dữ liệu giải nén vượt giới hạn sao lưu.');
      chunks.push(chunk);
      if (final) {const output = new Uint8Array(size); let offset = 0; for (const part of chunks) {output.set(part, offset); offset += part.length;} entries.set(file.name, output);}
    };
    file.start();
  });
  stream.register(UnzipInflate);
  for (let at = 0; at < bytes.length; at += 1024) {
    stream.push(bytes.subarray(at, at + 1024), at + 1024 >= bytes.length);
    if (at % (256 * 1024) === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (entries.size !== names.size) fail(); return entries;
}

export async function decodeLibrary(bytes: Uint8Array): Promise<LibraryBackup> {
  const files = await boundedUnzip(bytes);
  const json = (path: string) => {const file = files.get(path); if (!file) fail(); try {return JSON.parse(strFromU8(file));} catch {return fail();}};
  const manifest = json('manifest.json') as Manifest;
  if (!object(manifest) || manifest.format !== 'pianist-library' || manifest.version !== 1 || !number(manifest.createdAt)
    || !Array.isArray(manifest.projects) || manifest.projects.length > 1000 || !Array.isArray(manifest.recovery) || manifest.recovery.length > 1000) fail();
  const used = new Set(['manifest.json']);
  const read = async (ref: FileRef) => {
    if (!object(ref) || !text(ref.path) || used.has(ref.path) || !number(ref.bytes) || !/^[a-f0-9]{64}$/.test(ref.sha256)) fail();
    const file = files.get(ref.path); if (!file || file.length !== ref.bytes || await hash(file) !== ref.sha256) fail();
    used.add(ref.path); return file;
  };
  const projects: ProjectRecord[] = [], recovery: RecoveryRecord[] = [], ids = new Set<string>(), recoveryIds = new Set<string>();
  for (const saved of manifest.projects) {
    metadata(saved); if (ids.has(saved.id) || !number(saved.createdAt)) fail(); ids.add(saved.id);
    const {data, sourceData, ...meta} = saved, content = await read(data);
    await validateFile(content, meta.filename);
    const source = sourceData ? await read(sourceData) : undefined;
    if (source) {if (!text(meta.sourceName)) fail(); await validateFile(source, meta.sourceName);}
    projects.push({...meta, bytes: content, source});
  }
  for (const saved of manifest.recovery) {
    metadata(saved); if (!ids.has(saved.id) || recoveryIds.has(saved.id)) fail(); recoveryIds.add(saved.id);
    const {data, ...meta} = saved, content = await read(data); await validateFile(content, meta.filename); recovery.push({...meta, bytes: content});
  }
  await read(manifest.sessions); await read(manifest.settings);
  const sessions: SavedAttempt[] = json(manifest.sessions.path), settings: LibraryData['settings'] = json(manifest.settings.path);
  if (!Array.isArray(sessions) || sessions.length > 10000 || !sessions.every(resultValid) || new Set(sessions.map(s => s.id)).size !== sessions.length
    || !Array.isArray(settings) || settings.length > 10000 || !settings.every(s => object(s) && text(s.id)) || used.size !== files.size) fail();
  return {createdAt: manifest.createdAt, data: {projects, recovery, sessions, settings}, bytes: bytes.length};
}

export function restoredCopies(backup: LibraryBackup): LibraryData {
  const data = structuredClone(backup.data), ids = new Map<string, string>();
  // Histories whose original score was removed remain readable with an orphan
  // identity, never accidentally attach to a different score on this device.
  for (const id of [...data.projects.map(p => p.id), ...data.sessions.map(s => s.projectId)]) if (!ids.has(id)) ids.set(id, crypto.randomUUID());
  for (const project of data.projects) {project.id = ids.get(project.id)!; project.title = (project.title + ' — khôi phục').slice(0, 150);}
  for (const recovery of data.recovery) {recovery.id = ids.get(recovery.id)!; recovery.title = (recovery.title + ' — khôi phục').slice(0, 150);}
  for (const session of data.sessions) {session.id = crypto.randomUUID(); session.projectId = ids.get(session.projectId)!; if (session.schemaVersion===2) session.timeline.projectId=session.projectId; else {const replay=session.replay as any;if(replay?.plan) replay.plan.projectId=session.projectId;}}
  // Calibration belongs to the original MIDI/audio path. Keep it in the backup
  // record, but never silently activate it on a different computer.
  data.settings = [{id: 'restored-settings:' + crypto.randomUUID(), createdAt: backup.createdAt, settings: data.settings.filter(s => !s.id.startsWith('restored-settings:'))}];
  return data;
}
