import {Unzip, UnzipInflate, zip, strToU8, strFromU8} from 'fflate';
import type {LibraryData, ProjectRecord, RecoveryRecord} from './storage';
import type {SessionResult} from '../../../../packages/score-contracts/index';
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
  if (!object(record) || !text(record.id) || !text(record.title, 150) || !text(record.filename)
    || !Number.isSafeInteger(record.revision) || record.revision < 0 || !number(record.updatedAt)) fail();
}
function resultValid(r: any): r is SessionResult {
  if (!object(r) || r.schemaVersion !== 1 || !text(r.id) || !text(r.projectId) || typeof r.title !== 'string'
    || !text(r.fingerprint) || !number(r.createdAt) || !number(r.revision) || !['complete', 'aborted', 'interrupted'].includes(r.outcome)
    || !object(r.config) || !['wait', 'bpm'].includes(r.config.mode) || !['midi', 'virtual'].includes(r.config.inputSource)
    || !text(r.config.deviceId) || !text(r.config.algorithmVersion) || !object(r.config.roles) || !Array.isArray(r.config.voices)
    || !['bpm', 'beatQuarter', 'countIn', 'fromMeasure', 'toMeasure', 'loops', 'offsetMs', 'perfectMs', 'goodMs', 'windowMs', 'deliveryMs'].every(k => number(r.config[k]))
    || !r.config.voices.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 3)
    || !Object.values(r.config.roles).every(v => ['left', 'right', 'off'].includes(String(v))) || typeof r.clock !== 'string'
    || !['elapsedMs', 'planned', 'evaluated', 'matched', 'missed', 'extras', 'good', 'firstTry', 'groupsDone', 'corrections'].every(k => number(r[k]) && r[k] >= 0)
    || !['coverage', 'precision', 'timingRate', 'medianAbsMs', 'p90AbsMs', 'signedMeanMs'].every(k => r[k] === null || number(r[k]))) return false;
  for (const name of ['targets', 'assessments', 'extraEvents', 'chords', 'weakMeasures', 'perLoop', 'faults']) if (!Array.isArray(r[name]) || r[name].length > 200000) return false;
  if (!r.targets.every((t: any) => object(t) && text(t.id) && Number.isInteger(t.pitch) && t.pitch >= 0 && t.pitch <= 127
    && number(t.atMs) && number(t.endMs) && number(t.measure) && number(t.loop) && Array.isArray(t.roles) && t.roles.every((v: unknown) => ['left', 'right', 'off'].includes(String(v))) && Array.isArray(t.anchors))) return false;
  const ids = new Set(r.targets.map((t: any) => t.id));
  if (ids.size !== r.targets.length || new Set(r.assessments.map((a: any) => a?.targetId)).size !== r.assessments.length) return false;
  if (!r.assessments.every((a: any) => object(a) && ids.has(a.targetId) && ['matched', 'missed'].includes(a.status) && number(a.atMs))) return false;
  if (!r.chords.every((c: any) => object(c) && Array.isArray(c.ids) && (c.spreadMs === null || number(c.spreadMs)))
    || !r.weakMeasures.every((m: any) => object(m) && ['measure', 'missed', 'badTiming', 'evaluated'].every(k => number(m[k])))
    || !r.perLoop.every((l: any) => object(l) && ['loop', 'evaluated', 'matched', 'extras'].every(k => number(l[k])))) return false;
  if (r.releases !== undefined && (!Array.isArray(r.releases) || r.releases.length > r.targets.length
    || !r.releases.every((a: any) => object(a) && ids.has(a.targetId) && number(a.expectedMs) && ['good', 'short', 'long', 'unreleased', 'interrupted', 'unscored'].includes(a.status))
    || !(r.releaseRate === null || number(r.releaseRate)))) return false;
  if (r.replay && (!object(r.replay) || !object(r.replay.plan) || r.replay.plan.projectId !== r.projectId
    || !Array.isArray(r.replay.events) || r.replay.events.length > 50000 || !Array.isArray(r.replay.commands) || r.replay.commands.length > 80000)) return false;
  return true;
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
  const sessions: SessionResult[] = json(manifest.sessions.path), settings: LibraryData['settings'] = json(manifest.settings.path);
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
  for (const session of data.sessions) {session.id = crypto.randomUUID(); session.projectId = ids.get(session.projectId)!; if (session.replay) session.replay.plan.projectId = session.projectId;}
  // Calibration belongs to the original MIDI/audio path. Keep it in the backup
  // record, but never silently activate it on a different computer.
  data.settings = [{id: 'restored-settings:' + crypto.randomUUID(), createdAt: backup.createdAt, settings: data.settings.filter(s => !s.id.startsWith('restored-settings:'))}];
  return data;
}
