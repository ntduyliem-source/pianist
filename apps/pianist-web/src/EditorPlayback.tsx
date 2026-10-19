import {useEffect,useState} from 'react';
import type {EditorPlaybackState} from '../../../packages/engine-bridge';
import {workspace as ws} from './workspace';

const time=(n:number)=>{const s=Math.max(0,Math.floor(n||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
export function EditorPlayback(){
  const [state,setState]=useState<EditorPlaybackState>(),[error,setError]=useState('');
  const refresh=()=>{try{if(ws.bridge)setState(ws.bridge.playbackState());}catch(e){setError(String(e instanceof Error?e.message:e));}};
  const command=(name:'toggle'|'stop'|'seek',value=0)=>{
    try{ws.bridge?.api.Module.driver?.resume();ws.bridge?.playback(name,value);setError('');refresh();}
    catch(e){setError(String(e instanceof Error?e.message:e));}
  };
  useEffect(()=>{
    refresh();const timer=setInterval(refresh,200);
    return()=>{clearInterval(timer);ws.bridge?.api.editorPlayback?.('stop');};
  },[]);
  const ready=state?.available&&!ws.state.busy,playing=state?.status==='playing';
  return <div className="editor-playback" role="region" aria-label="Phát bản nhạc trong editor">
    <button className={playing?'':'primary'} disabled={!ready} onClick={()=>command('toggle')} title="Phát / tạm dừng · Space" aria-label={playing?'Tạm dừng phát nhạc':'Phát nhạc'}>{playing?'Ⅱ Tạm dừng':'▶ Phát nhạc'}</button>
    <button disabled={!ready} onClick={()=>command('stop')} aria-label="Dừng phát nhạc">■ Dừng</button>
    <span className="editor-playback-time">{time(state?.positionSeconds??0)}</span>
    <input type="range" aria-label="Vị trí phát nhạc" min={0} max={state?.durationSeconds||1} step={0.1} value={Math.min(state?.positionSeconds??0,state?.durationSeconds||1)} disabled={!ready} onChange={e=>command('seek',+e.target.value)}/>
    <span className="editor-playback-time">{time(state?.durationSeconds??0)}</span>
    <span className="editor-playback-state" role="status">{error||(!ready?'Đang chuẩn bị âm thanh…':playing?'Đang phát':state?.status==='paused'?'Đã tạm dừng':'Space để phát')}</span>
  </div>;
}
