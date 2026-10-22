export type Hand = 'left'|'right'|'both';
export type Asset = {path:string;sha256:string;bytes:number};
export interface Exercise extends Asset {
  id:string;hand:Hand;targetCount:number;motifGroupId:string;title:string;grades:number[];profiles:string[];
  sourceId:string;sourceMeasures:[number,number];beatQuarter:number[];
  scoreId:string;lengthBucket:string;bookPosition:number;abcSha256:string;countRight:number;countLeft:number;
  sources:{title:string;composer:string;source_url:string;license_id:string;license_url:string}[];
}
export interface Option extends Asset {grade:number;lengthBucket:string;count:number;byHand:Record<Hand,number>}
export interface BankIndex {
  schemaVersion:1;kind:'composed-abc-v1';releaseId:string;sourceRelease:string;visibility:string;total:number;minimum:number;
  lengthBuckets:{id:string;label:string;min:number;max:number}[];options:Option[];
}
export interface Bank {
  index:BankIndex;
  option(option:Option,signal?:AbortSignal):Promise<Exercise[]>;
  bytes(exercise:Exercise,signal?:AbortSignal):Promise<Uint8Array>;
}
const utf8=new TextDecoder(),hash=/^[a-f0-9]{64}$/;
export const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function safePath(path:string):boolean{return typeof path==='string'&&/^[a-zA-Z0-9_.\-/]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..');}
function validAsset(asset:Asset){return !!asset&&safePath(asset.path)&&Number.isSafeInteger(asset.bytes)&&asset.bytes>=1&&asset.bytes<=20*1024*1024&&hash.test(asset.sha256);}
export async function checked(bytes:Uint8Array,asset:Asset){
  if(!validAsset(asset)||bytes.length!==asset.bytes||await sha(bytes)!==asset.sha256)throw Error('Dữ liệu kho không khớp mã kiểm tra: '+asset?.path);
  return bytes;
}
export function validateIndex(index:BankIndex):BankIndex {
  if(!index||index.schemaVersion!==1||index.kind!=='composed-abc-v1'||!/^web-[a-f0-9]{20}$/.test(index.releaseId)||!Array.isArray(index.options)||index.options.length!==56||index.lengthBuckets?.length!==7)throw Error('Kho theo grade chưa đúng phiên bản hai khuông mới.');
  const expected=[[4,3,5],[6,6,8],[10,9,14],[20,15,24],[30,25,39],[50,40,69],[100,70,120]];
  for(const [n,min,max]of expected){const b=index.lengthBuckets.find(b=>b.id==='n'+n);if(!b||b.min!==min||b.max!==max)throw Error('Khoảng nốt không hợp lệ.');}
  const keys=new Set<string>();
  for(const o of index.options){const key=o.grade+':'+o.lengthBucket;
    if(!Number.isInteger(o.grade)||o.grade<1||o.grade>8||!index.lengthBuckets.some(b=>b.id===o.lengthBucket)||keys.has(key)||!Number.isInteger(o.count)||o.count<0||!validAsset(o)||o.byHand?.both!==o.count||o.byHand.left!==0||o.byHand.right!==0)throw Error('Chỉ mục grade/độ dài không hợp lệ.');keys.add(key);
  }
  if(!Number.isSafeInteger(index.total)||index.total!==index.options.reduce((n,o)=>n+o.count,0))throw Error('Tổng số bài không khớp chỉ mục.');
  return index;
}
export function validateEntries(entries:Exercise[],index:BankIndex,o:Option){
  const bucket=index.lengthBuckets.find(b=>b.id===o.lengthBucket)!;
  if(!Array.isArray(entries)||entries.length!==o.count||new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Số bài trong chỉ mục không khớp.');
  const positions=new Set<number>();
  for(const e of entries){
    if(!hash.test(e.id)||!validAsset(e)||e.sha256!==e.id||e.path!=='exercises/'+e.id+'.mxl'||!Array.isArray(e.grades)||!e.grades.includes(o.grade)||e.hand!=='both'||!Number.isInteger(e.targetCount)||e.targetCount<bucket.min||e.targetCount>bucket.max||e.lengthBucket!==o.lengthBucket||!Number.isInteger(e.bookPosition)||e.bookPosition<1||e.bookPosition>o.count||positions.has(e.bookPosition)||!hash.test(e.abcSha256)||!Number.isInteger(e.countRight)||e.countRight<1||!Number.isInteger(e.countLeft)||e.countLeft<1||e.countRight+e.countLeft!==e.targetCount||typeof e.scoreId!=='string'||!/^g[1-8]-n(?:4|6|10|20|30|50|100)-\d{3}$/.test(e.scoreId)||!e.scoreId.startsWith('g'+o.grade+'-'+o.lengthBucket+'-')||typeof e.sourceId!=='string'||!e.sourceId||typeof e.motifGroupId!=='string'||!e.motifGroupId||typeof e.title!=='string'||!Array.isArray(e.beatQuarter)||e.beatQuarter.length!==1||![.5,1,1.5].includes(e.beatQuarter[0]))throw Error('Bài tập không đủ hai khuông hoặc không thuộc lựa chọn đã tải.');
    positions.add(e.bookPosition);
  }
  return entries;
}
export async function loadBank(signal?:AbortSignal):Promise<Bank>{
  // Hosted composed bank only. Old K5 ZIP overrides are deliberately not read.
  const base=new URL('curriculum/',location.href);
  const fetchBytes=async(url:URL,abort?:AbortSignal)=>{const r=await fetch(url,{signal:abort});if(!r.ok)throw Error('Không tải được kho theo grade. Thử lại khi có mạng.');return new Uint8Array(await r.arrayBuffer());};
  const p=JSON.parse(utf8.decode(await fetchBytes(new URL('manifest.json',base),signal))) as {schemaVersion:number;releaseId:string;index:Asset};
  if(p.schemaVersion!==1||!/^web-[a-f0-9]{20}$/.test(p.releaseId)||!validAsset(p.index)||!p.index.path.startsWith(p.releaseId+'/'))throw Error('Manifest kho không hợp lệ.');
  const index=validateIndex(JSON.parse(utf8.decode(await checked(await fetchBytes(new URL(p.index.path,base),signal),p.index))));
  if(index.releaseId!==p.releaseId)throw Error('Các phiên bản kho không khớp.');
  const release=new URL(p.releaseId+'/',base);
  return makeBank(index,async(asset,abort)=>checked(await fetchBytes(new URL(asset.path,release),abort),asset));
}
function makeBank(index:BankIndex,read:(asset:Asset,signal?:AbortSignal)=>Promise<Uint8Array>):Bank{
  const cache=new Map<string,Uint8Array>();
  return {index,async option(o,signal){const data=JSON.parse(utf8.decode(await read(o,signal)));signal?.throwIfAborted();if(data.releaseId!==index.releaseId||data.grade!==o.grade||data.lengthBucket!==o.lengthBucket)throw Error('Lựa chọn bị trộn phiên bản.');return validateEntries(data.entries,index,o);},
    async bytes(e,signal){signal?.throwIfAborted();const hit=cache.get(e.id);if(hit)return hit;const data=await read(e,signal);signal?.throwIfAborted();if(cache.size>=12)cache.delete(cache.keys().next().value!);cache.set(e.id,data);return data;}};
}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pianist-grade-practice-v1',1);r.onupgradeneeded=()=>{for(const name of ['settings','attempts'])r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};});}
export async function getData<T>(store:string,id:string):Promise<T|undefined>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function putData(store:string,value:{id:string;[k:string]:unknown}){const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(t.error??Error('Chưa lưu được lựa chọn theo grade.'));});}
