import {useEffect, useRef, useState} from 'react';
import {workspace as ws, type TuneSelection} from '../workspace';
import {MAX_IMPORT_BATCH_BYTES, type ProjectRecord} from './storage';

export function SourceLabel({project}: {project: ProjectRecord}) {
  const format = project.sourceFormat ?? project.sourceName?.split('.').at(-1)?.toLowerCase();
  if (!format) return null;
  return <span className="source-label" title={project.sourceName}>Nguồn {format.toUpperCase()}{project.sourceTuneIndex !== undefined ? ` · bài ${project.sourceTuneIndex + 1}` : ''}</span>;
}

export function TuneImportDialog({selection}: {selection: TuneSelection}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(selection.selected), [openIndex, setOpenIndex] = useState(selection.openIndex);
  const sourceBytes = selection.sourceBytes * selected.length, tooLarge = sourceBytes > MAX_IMPORT_BATCH_BYTES;
  useEffect(() => {ref.current?.showModal(); return () => ref.current?.close();}, []);
  const toggle = (index: number) => {
    const next = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index].sort((a,b) => a-b);
    setSelected(next); if (!next.includes(openIndex)) setOpenIndex(next[0] ?? -1);
  };
  return <dialog ref={ref} className="tune-dialog" aria-labelledby="tune-title" onCancel={e => {e.preventDefault(); ws.cancelOpen();}}>
    <h2 id="tune-title">Chọn bài trong file ABC</h2><p>{selection.filename} · {selection.tunes.length} bài</p>
    <p>Chọn những bài muốn lưu, rồi chọn một bài để {selection.practice ? 'tập' : 'mở trong editor'}.</p>
    {selection.error && <p role="alert" className="tune-error">{selection.error} Chưa lưu bài nào trong lô này.</p>}
    <div className="tune-list">{selection.tunes.map(tune => <div className="tune-row" key={tune.index}>
      <label><input type="checkbox" checked={selected.includes(tune.index)} onChange={() => toggle(tune.index)}/>
        <span><strong>{tune.hasTitle ? tune.title : `${selection.filename.replace(/\.abc$/i, '')} — ${tune.index + 1}`}</strong><small>Bài {tune.index + 1} · X:{tune.id || 'trống'}</small></span></label>
      <label className="tune-open"><input type="radio" name="open-tune" aria-label={`Mở bài ${tune.index + 1} sau khi nhập`} disabled={!selected.includes(tune.index)} checked={openIndex === tune.index} onChange={() => setOpenIndex(tune.index)}/>{selection.practice ? 'Tập bài này' : 'Mở bài này'}</label>
      {selection.errors[tune.index] && <p className="tune-error" role="alert">{selection.errors[tune.index]}</p>}
    </div>)}</div>
    <p className={tooLarge ? 'tune-error' : 'muted'}>{selected.length} bài · riêng bản nguồn cần {(sourceBytes / 1024 / 1024).toFixed(2)} MiB. Dung lượng bản nhạc MSCZ được tính sau chuyển đổi. Tối đa 128 MiB mỗi lô.</p>
    <div className="dialog-actions"><button onClick={() => ws.cancelOpen()}>Hủy nhập ABC</button><button className="primary" disabled={!selected.length || tooLarge || !selected.includes(openIndex)} onClick={() => ws.selectTunes(selected, openIndex)}>Nhập {selected.length} bài</button></div>
  </dialog>;
}
