import {Unzip,UnzipInflate} from 'fflate';

export type Hand = 'left'|'right'|'both';
export type Asset = {path:string;sha256:string;bytes:number};
export interface Exercise extends Asset {
  id:string;hand:Hand;targetCount:number;motifGroupId:string;title:string;grades:number[];profiles:string[];
  sourceId:string;sourceMeasures:[number,number];beatQuarter:number[];
  sources:{title:string;composer:string;source_url:string;license_id:string;license_url:string}[];
}
export interface Option extends Asset {grade:number;lengthBucket:string;count:number;byHand:Record<Hand,number>}
export interface BankIndex {
  schemaVersion:1;releaseId:string;sourceRelease:string;visibility:string;total:number;minimum:number;
  lengthBuckets:{id:string;label:string;min:number;max:number}[];options:Option[];
}
export interface Bank {
  index:BankIndex;
  option(option:Option,signal?:AbortSignal):Promise<Exercise[]>;
  bytes(exercise:Exercise,signal?:AbortSignal):Promise<Uint8Array>;
}
const utf8=new TextDecoder();
export const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function safePath(path:string):boolean{return typeof path==='string'&&/^[a-zA-Z0-9_.\-/]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..');}
export async function checked(bytes:Uint8Array,asset:Asset){
  if(!safePath(asset.path)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>20*1024*1024||bytes.length!==asset.bytes||await sha(bytes)!==asset.sha256)throw Error('Dữ liệu kho không khớp mã kiểm tra: '+asset.path);
  return bytes;
}
function validateIndex(index:BankIndex):BankIndex {
  if(index.schemaVersion!==1||!/^web-[a-f0-9]{20}$|^reading-mxl-v1-[a-f0-9]{16}$/.test(index.releaseId)||!Array.isArray(index.options)||index.options.length!==56||index.lengthBuckets?.length!==7)throw Error('Kho bài tập chưa đúng định dạng K5/web v1.');
  const keys=new Set<string>();
  for(const o of index.options){const key=o.grade+':'+o.lengthBucket;if(!Number.isInteger(o.grade)||o.grade<1||o.grade>8||!index.lengthBuckets.some(b=>b.id===o.lengthBucket)||keys.has(key)||!Number.isInteger(o.count)||o.count<0||!safePath(o.path))throw Error('Chỉ mục grade/độ dài không hợp lệ.');keys.add(key);}
  return index;
}
function validateEntries(entries:Exercise[],index:BankIndex,o:Option){
  const bucket=index.lengthBuckets.find(b=>b.id===o.lengthBucket)!;
  if(!Array.isArray(entries)||entries.length!==o.count||new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Số bài trong chỉ mục không khớp.');
  for(const e of entries)if(!/^[a-f0-9]{64}$/.test(e.id)||e.path!=='exercises/'+e.id+'.mxl'||!e.grades.includes(o.grade)||!['left','right','both'].includes(e.hand)||!Number.isInteger(e.targetCount)||e.targetCount<bucket.min||e.targetCount>bucket.max)throw Error('Bài tập không thuộc lựa chọn đã tải.');
  return entries;
}
export async function loadBank(signal?:AbortSignal):Promise<Bank>{
  const saved=await getData<{id:string;index:BankIndex}>('settings','active-bank');
  if(saved){const index=validateIndex(saved.index);return makeBank(index,async asset=>{const stored=await getData<{id:string;bytes:Uint8Array}>('assets',index.releaseId+'/'+asset.path);if(!stored)throw Error('Kho đã nhập thiếu file. Hãy nhập lại ZIP.');return checked(stored.bytes,asset);});}
  const base=new URL('curriculum/',location.href);
  const fetchBytes=async(url:URL,abort?:AbortSignal)=>{const r=await fetch(url,{signal:abort});if(!r.ok)throw Error('Không tải được kho bài tập. Thử lại khi có mạng hoặc nhập gói K5 ZIP.');return new Uint8Array(await r.arrayBuffer());};
  const p=JSON.parse(utf8.decode(await fetchBytes(new URL('manifest.json',base),signal))) as {schemaVersion:number;releaseId:string;index:Asset};
  if(p.schemaVersion!==1||!safePath(p.index?.path)||!p.index.path.startsWith(p.releaseId+'/'))throw Error('Manifest kho không hợp lệ.');
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
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pianist-exercises-v1',1);r.onupgradeneeded=()=>{for(const name of ['assets','settings','seen','attempts'])r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};});}
export async function getData<T>(store:string,id:string):Promise<T|undefined>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function putData(store:string,value:{id:string;[k:string]:unknown}){const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(t.error??Error('Chưa lưu được dữ liệu bài tập.'));});}
export async function useHostedBank(){const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction('settings','readwrite');t.objectStore('settings').delete('active-bank');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}

/** Import the original K5 ZIP atomically. Its content remains on this device. */
export async function importBank(file:File,progress:(message:string)=>void):Promise<void>{
  if(file.size>64*1024*1024)throw Error('Gói ZIP vượt 64 MiB.');
  progress('Đang đọc gói K5…');
  let expanded=0,count=0,finished=0;
  const compressed=new Uint8Array(await file.arrayBuffer());
  const files:Record<string,Uint8Array>=Object.create(null),names=new Set<string>();
  const unzip=new Unzip(entry=>{
    if(++count>6000||!safePath(entry.name)||names.has(entry.name)||(entry.originalSize??0)>20*1024*1024)throw Error('ZIP trùng tên, sai đường dẫn hoặc vượt giới hạn.');
    names.add(entry.name);let size=0;const chunks:Uint8Array[]=[];
    entry.ondata=(error,data,final)=>{
      if(error)throw error;size+=data.length;expanded+=data.length;
      if(size>20*1024*1024||expanded>96*1024*1024)throw Error('Dữ liệu giải nén vượt giới hạn.');
      chunks.push(data);
      if(final){const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}files[entry.name]=bytes;finished++;}
    };entry.start();
  });
  unzip.register(UnzipInflate);
  for(let offset=0;offset<compressed.length;offset+=1024){unzip.push(compressed.subarray(offset,offset+1024),offset+1024>=compressed.length);if(offset%(256*1024)===0)await new Promise(resolve=>setTimeout(resolve,0));}
  if(!count||finished!==count)throw Error('Gói ZIP bị thiếu hoặc hỏng.');
  const parse=(name:string)=>{if(!files[name])throw Error('Gói K5 thiếu '+name);return JSON.parse(utf8.decode(files[name]));};
  const manifest=parse('manifest.json');
  if(manifest.schemaVersion!==1||!/^reading-mxl-v1-[a-f0-9]{16}$/.test(manifest.releaseId)||!manifest.files)throw Error('Chọn ZIP xuất bởi bước K5.');
  const assets=Object.entries(manifest.files) as [string,Omit<Asset,'path'>][];
  if(assets.length!==Object.keys(files).length-1)throw Error('ZIP và manifest có số file khác nhau.');
  for(let start=0;start<assets.length;start+=40){
    await Promise.all(assets.slice(start,start+40).map(([path,a])=>{if(!files[path])throw Error('ZIP thiếu '+path);return checked(files[path],{path,...a});}));
    progress(`Kiểm toàn vẹn ${Math.min(start+40,assets.length)}/${assets.length} file…`);
  }
  const catalog=parse('catalog.json'),origins=new Map<string,any>(parse('attribution.json').sources.map((s:any)=>[s.id,s]));
  if(catalog.releaseId!==manifest.releaseId)throw Error('Catalog khác phiên bản manifest.');
  const releaseId=manifest.releaseId;
  const entries:Exercise[]=catalog.entries.map((e:any)=>({...e,sourceId:e.originalSourceSha256,
    sources:e.provenance.map((id:string)=>origins.get(id)).filter(Boolean)}));
  const byId=new Map(entries.map(e=>[e.id,e]));
  if(entries.length>10000||byId.size!==entries.length)throw Error('Catalog quá lớn hoặc trùng ID.');
  const generated=new Map<string,Uint8Array>(),options:Option[]=[];
  for(const o of catalog.options){
    const raw=parse(o.path),rows:Exercise[]=raw.ids.map((id:string)=>{const e=byId.get(id);if(!e)throw Error('Chỉ mục trỏ đến bài không có.');return e;});
    const bytes=new TextEncoder().encode(JSON.stringify({schemaVersion:1,releaseId,grade:o.grade,lengthBucket:o.lengthBucket,entries:rows}));
    generated.set(o.path,bytes);
    options.push({...o,bytes:bytes.length,sha256:await sha(bytes),byHand:Object.fromEntries(['left','right','both'].map(hand=>[hand,rows.filter(e=>e.hand===hand).length])) as Record<Hand,number>});
  }
  const index=validateIndex({schemaVersion:1,releaseId,sourceRelease:releaseId,visibility:'device-only',total:entries.length,minimum:300,lengthBuckets:catalog.lengthBuckets,options});
  for(const o of options)validateEntries(JSON.parse(utf8.decode(generated.get(o.path))).entries,index,o);
  for(const e of entries){await checked(files[e.path],e);generated.set(e.path,files[e.path]);}
  progress(`Đang lưu ${entries.length.toLocaleString('vi')} bài trên thiết bị…`);
  const d=await db();
  await new Promise<void>((resolve,reject)=>{
    const t=d.transaction(['assets','settings'],'readwrite'),s=t.objectStore('assets');
    s.clear();
    for(const [path,bytes]of generated)s.put({id:releaseId+'/'+path,bytes});
    t.objectStore('settings').put({id:'active-bank',index});
    t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(t.error??Error('Không đủ bộ nhớ; kho trước vẫn được giữ.'));
  });
}
