export interface BundledScore {
  id:string;title:string;filename:string;url:string;bytes:number;sha256:string;composer?:string;
  workId?:string;version?:number;versionLabel?:string;practiceReady?:boolean;practiceNotice?:string;
}
export interface BundledWork {id:string;title:string;versions:BundledScore[]}
const hash=/^[a-f0-9]{64}$/;
function validateScore(s:BundledScore):void{
  if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>180||typeof s.filename!=='string'||!s.filename.endsWith('.mxl')||s.filename.length>200||!/^library\/songs\/[a-z0-9-]+\.mxl$/.test(s.url)||!Number.isSafeInteger(s.bytes)||s.bytes<=0||s.bytes>32*1024**2||!hash.test(s.sha256)||!hash.test(s.id)||s.id!==s.sha256)throw Error('Bài trong danh mục không hợp lệ.');
  if(s.composer!==undefined&&(typeof s.composer!=='string'||s.composer.length>180))throw Error('Tác giả trong danh mục không hợp lệ.');
  if((s.workId!==undefined)!==(s.version!==undefined)||s.workId!==undefined&&(!hash.test(s.workId)||!Number.isSafeInteger(s.version)||s.version! < 1||s.version! > 500)
    ||s.versionLabel!==undefined&&(typeof s.versionLabel!=='string'||!s.versionLabel.trim()||s.versionLabel.length>120)
    ||s.practiceReady!==undefined&&typeof s.practiceReady!=='boolean'
    ||s.practiceNotice!==undefined&&(typeof s.practiceNotice!=='string'||!s.practiceNotice.trim()||s.practiceNotice.length>300)
    ||s.practiceReady===false&&!s.practiceNotice)throw Error('Thông tin phiên bản bài hát không hợp lệ.');
}
export function groupBundledScores(scores:BundledScore[]):BundledWork[]{
  const groups=new Map<string,BundledWork>();
  for(const score of scores){
    const id=score.workId??score.id;
    const work:BundledWork=groups.get(id)??{id,title:score.title,versions:[]};
    work.versions.push(score);groups.set(id,work);
  }
  for(const work of groups.values()){
    work.versions.sort((a,b)=>(a.version??1)-(b.version??1));
    work.title=(work.versions.find(s=>s.id===work.id)??work.versions[0]).title;
  }
  return [...groups.values()];
}
export function selectBundledVersion(work:BundledWork,id?:string):BundledScore{
  return work.versions.find(s=>s.id===id)??work.versions[0];
}
export function bundledVersionLabel(score:BundledScore):string{
  return `Version ${score.version??1}${score.versionLabel?' · '+score.versionLabel:''}`;
}
export function matchesBundledWork(work:BundledWork,search:string):boolean{
  const query=search.trim().toLocaleLowerCase('vi');
  return !query||[work.title,...work.versions.flatMap(s=>[s.title,s.composer??'',s.versionLabel??''])].some(s=>s.toLocaleLowerCase('vi').includes(query));
}
export async function bundledPracticeNotice(scores:BundledScore[],sourceName?:string,source?:Uint8Array):Promise<string|undefined>{
  if(!source)return;
  const candidates=scores.filter(s=>s.practiceReady===false&&s.filename===sourceName&&s.bytes===source.byteLength);
  if(!candidates.length)return;
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',source as Uint8Array<ArrayBuffer>))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return candidates.find(s=>s.sha256===sha)?.practiceNotice;
}
export function parseBundledCatalog(data:unknown):BundledScore[]{
  const d=data as {schemaVersion?:number;songs?:BundledScore[]};
  if(d?.schemaVersion!==1||!Array.isArray(d.songs)||d.songs.length>500)throw Error('Danh mục bài hát không hợp lệ.');
  const ids=new Set<string>(),urls=new Set<string>();
  for(const s of d.songs){
    validateScore(s);
    if(ids.has(s.id)||urls.has(s.url))throw Error('Bài trong danh mục bị trùng.');
    ids.add(s.id);urls.add(s.url);
  }
  for(const work of groupBundledScores(d.songs)){
    const versions=work.versions.map(s=>s.version??1);
    if(!work.versions.some(s=>s.id===work.id&&(s.version??1)===1)||new Set(versions).size!==versions.length)throw Error('Nhóm phiên bản bài hát không hợp lệ.');
  }
  return d.songs;
}
export async function loadBundledCatalog():Promise<BundledScore[]>{
  const r=await fetch('library/catalog.json');if(r.status===404)return[];if(!r.ok)throw Error('Không tải được danh mục bài hát.');return parseBundledCatalog(await r.json());
}
export async function loadBundledScore(score:BundledScore):Promise<Uint8Array>{
  validateScore(score);
  const r=await fetch(score.url);if(!r.ok)throw Error('Không tải được '+score.title+'.');
  const bytes=new Uint8Array(await r.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==score.bytes||hash!==score.sha256)throw Error('File bài hát chưa tải đủ hoặc sai phiên bản. Hãy thử lại.');
  return bytes;
}
