import type { SessionResult } from '../../../../packages/score-contracts/index';

export interface ProjectRecord {id: string; title: string; filename: string; bytes: Uint8Array; source?: Uint8Array; sourceName?: string; revision: number; fingerprint?: string; updatedAt: number; createdAt: number; archived?: boolean}
export interface RecoveryRecord {id: string; bytes: Uint8Array; revision: number; updatedAt: number; title: string; filename: string}
const OWNER = crypto.randomUUID(), LEASE_MS = 20000;
const browserLocks = new Map<string, () => void>();
const pendingLocks = new Map<string, Promise<void>>();
async function browserLock(id: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return false;
  if (!browserLocks.has(id)) {
    if (!pendingLocks.has(id)) {
      const ready = new Promise<void>((resolve, reject) => {
        void navigator.locks.request('pianist-project:' + id, {ifAvailable: true}, lock => {
          if (!lock) {reject(Error('Bài này đang mở ở tab khác. Hãy đóng bài ở tab đó trước.')); return;}
          return new Promise<void>(release => {browserLocks.set(id, release); resolve();});
        }).catch(reject);
      });
      pendingLocks.set(id, ready);
    }
    try {await pendingLocks.get(id);} finally {pendingLocks.delete(id);}
  }
  return true;
}
let database: Promise<IDBDatabase>;
export function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('pianist-library', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ['projects', 'recovery', 'sessions', 'settings', 'leases']) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, {keyPath: 'id'});
    };
    req.onblocked = () => reject(Error('Hãy đóng tab Pianist cũ để nâng cấp thư viện.'));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
  });
}
const request = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);});
const committed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? Error('Không commit được dữ liệu.'));});
export async function list<T>(store: string): Promise<T[]> {const db = await openDatabase(); return request(db.transaction(store).objectStore(store).getAll());}
export async function get<T>(store: string, id: string): Promise<T | undefined> {const db = await openDatabase(); return request(db.transaction(store).objectStore(store).get(id));}
export async function put(store: string, value: object): Promise<void> {const db = await openDatabase(); const tx = db.transaction(store, 'readwrite'); const done = committed(tx); tx.objectStore(store).put(value); await done;}
export async function claimProject(id: string): Promise<void> {
  const exclusive = await browserLock(id);
  const db = await openDatabase(), tx = db.transaction('leases', 'readwrite'), done = committed(tx);
  const leases = tx.objectStore('leases');
  const existing = await request(leases.get(id));
  if (!exclusive && existing && existing.owner !== OWNER && existing.expires > Date.now()) {tx.abort(); await done.catch(() => {}); throw Error('Bài này đang mở ở tab khác. Hãy đóng bài ở tab đó trước.');}
  leases.put({id, owner: OWNER, expires: Date.now() + LEASE_MS}); await done;
}
export async function releaseProject(id: string): Promise<void> {
  browserLocks.get(id)?.(); browserLocks.delete(id); pendingLocks.delete(id);
  const db = await openDatabase(), tx = db.transaction('leases', 'readwrite'), done = committed(tx), leases = tx.objectStore('leases');
  const existing = await request(leases.get(id)); if (existing?.owner === OWNER) leases.delete(id); await done;
}
export async function saveProject(project: ProjectRecord | RecoveryRecord, recovery = false, clearRecovery = true): Promise<void> {
  const db = await openDatabase(), tx = db.transaction(['leases', 'projects', 'recovery'], 'readwrite'), done = committed(tx);
  const lease = await request(tx.objectStore('leases').get(project.id));
  if (lease?.owner !== OWNER || lease.expires <= Date.now()) {tx.abort(); await done.catch(() => {}); throw Error('Quyền ghi bài đã hết hạn. Mở lại bài để tránh ghi đè từ tab khác.');}
  tx.objectStore(recovery ? 'recovery' : 'projects').put(project);
  if (!recovery && clearRecovery) tx.objectStore('recovery').delete(project.id);
  await done; // Only now may the UI claim this revision was stored.
}
export async function saveSession(result: SessionResult): Promise<void> {
  // Keep complete summaries, cap optional replay data and history storage.
  if (result.replay && (result.replay.events.length > 50000 || result.replay.commands.length > 80000)) delete result.replay;
  const db = await openDatabase(), tx = db.transaction('sessions', 'readwrite'), done = committed(tx), store = tx.objectStore('sessions');
  store.put(result);
  const all = await request(store.getAll()) as SessionResult[];
  all.sort((a, b) => b.createdAt - a.createdAt);
  // Do not silently remove results: trim optional event logs from older sessions only.
  for (const session of all.slice(20)) if (session.replay) { delete session.replay; store.put(session); }
  await done;
}
export function storageError(e: unknown): string {
  return e instanceof DOMException && e.name === 'QuotaExceededError'
    ? 'Bộ nhớ trình duyệt đã đầy. Chưa lưu được; hãy tải MSCZ để giữ bản sao.'
    : e instanceof Error ? e.message : String(e);
}
