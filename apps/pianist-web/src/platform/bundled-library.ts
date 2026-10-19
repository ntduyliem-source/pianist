export interface BundledScore {id:string;title:string;filename:string;url:string;bytes:number;sha256:string;composer?:string}
export function parseBundledCatalog(data:unknown):BundledScore[]{
  const d=data as {schemaVersion?:number;songs?:BundledScore[]};
  if(d?.schemaVersion!==1||!Array.isArray(d.songs)||d.songs.length>500)throw Error('Danh mục bài hát không hợp lệ.');
  const ids=new Set<string>();
  for(const s of d.songs){
    if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>180||typeof s.filename!=='string'||!s.filename.endsWith('.mxl')||s.filename.length>200||!/^library\/songs\/[a-z0-9-]+\.mxl$/.test(s.url)||!Number.isSafeInteger(s.bytes)||s.bytes<=0||s.bytes>32*1024**2||!/^[a-f0-9]{64}$/.test(s.sha256)||!/^[a-f0-9]{64}$/.test(s.id)||s.id!==s.sha256||ids.has(s.id))throw Error('Bài trong danh mục không hợp lệ.');
    ids.add(s.id);
  }
  return d.songs;
}
export async function loadBundledCatalog():Promise<BundledScore[]>{
  const r=await fetch('library/catalog.json');if(r.status===404)return[];if(!r.ok)throw Error('Không tải được danh mục bài hát.');return parseBundledCatalog(await r.json());
}
export async function loadBundledScore(score:BundledScore):Promise<Uint8Array>{
  parseBundledCatalog({schemaVersion:1,songs:[score]});
  const r=await fetch(score.url);if(!r.ok)throw Error('Không tải được '+score.title+'.');
  const bytes=new Uint8Array(await r.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==score.bytes||hash!==score.sha256)throw Error('File bài hát chưa tải đủ hoặc sai phiên bản. Hãy thử lại.');
  return bytes;
}
