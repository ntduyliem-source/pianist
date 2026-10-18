import React, {memo, useEffect, useMemo, useRef, useState} from 'react';
import type {ScoreSnapshot} from '../../../../packages/score-contracts/index';
import {noteName} from '../platform/midi-v2';
import type {Marker} from './feedback-v2';

interface Props {
  snapshot: ScoreSnapshot; markers: Map<string, Marker>; currentAnchors: string[]; zoom: number; autoScroll: boolean;
  fromMeasure: number; toMeasure: number; selecting: 'a' | 'b' | null; onMeasure: (index: number) => void;
}
const NoteMarker = memo(function NoteMarker({anchor: a, page, marker}: {anchor: ScoreSnapshot['anchors'][number]; page: ScoreSnapshot['pages'][number]; marker?: Marker}) {
  return <g id={'anchor-' + a.id} data-anchor={a.id} data-pitch={a.pitch} className={'note-marker ' + (marker?.kind ?? '') + (marker?.provisional ? ' provisional' : '')}>
    <rect x={a.box.x - page.offsetX - 10} y={a.box.y - page.offsetY - 10} width={a.box.width + 20} height={a.box.height + 20} rx="14" vectorEffect="non-scaling-stroke"/>
    <text x={a.box.x - page.offsetX + a.box.width / 2} y={a.box.y - page.offsetY - 18} style={{fontSize: Math.max(70, a.box.height)}} textAnchor="middle">{marker?.symbol ?? ''}</text>
    <title>{noteName(a.pitch)} · {marker?.label ?? 'chưa đánh giá'}</title>
  </g>;
}, (a, b) => a.anchor === b.anchor && a.page === b.page && a.marker?.kind === b.marker?.kind && a.marker?.label === b.marker?.label && a.marker?.provisional === b.marker?.provisional);

const Page = memo(function Page({snapshot, index, url, markers, zoom, fromMeasure, toMeasure, selecting, onMeasure}: Omit<Props, 'currentAnchors' | 'autoScroll'> & {index: number; url: string}) {
  const page = snapshot.pages[index], element = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(index === 0);
  const anchors = useMemo(() => snapshot.anchors.filter(a => a.page === index && a.visible), [snapshot, index]);
  const measures = useMemo(() => snapshot.measures.filter(m => m.page === index), [snapshot, index]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {root: document.getElementById('sheet-scroll'), rootMargin: '500px'});
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={element} className="score-page" data-page={index} style={{width: `${(page.displayWidth ?? page.width * 96 / 1200) * zoom / 100}px`, aspectRatio: `${page.width}/${page.height}`}}>
    <img src={url} loading={index === 0 ? 'eager' : 'lazy'} alt={`${snapshot.title} · trang ${index + 1}`} draggable={false}/>
    {visible && <svg className="score-overlay" viewBox={`0 0 ${page.width} ${page.height}`} aria-label={'Vị trí nốt trang ' + (index + 1)}>
      {measures.map(m => <rect key={m.index} className={'measure-area ' + (m.index >= fromMeasure && m.index <= toMeasure ? 'in-range' : '')} x={m.box.x - page.offsetX} y={m.box.y - page.offsetY} width={Math.max(1, m.box.width)} height={Math.max(10, m.box.height)} onClick={() => onMeasure(m.index)}><title>Ô nhịp {m.label}{selecting ? ' · chọn ' + selecting.toUpperCase() : ''}</title></rect>)}
      {anchors.map(a => <NoteMarker key={a.id} anchor={a} page={page} marker={markers.get(a.id)}/>)}
    </svg>}
    <span className="page-number">{index + 1}</span>
  </div>;
});

export const Sheet = memo(function Sheet(props: Props) {
  const {snapshot, currentAnchors, autoScroll} = props, scroll = useRef<HTMLDivElement>(null);
  const urls = useMemo(() => snapshot.pages.map(p => URL.createObjectURL(new Blob([p.svg], {type: 'image/svg+xml'}))), [snapshot]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  const anchorIndex = useMemo(() => new Map(snapshot.anchors.map(a => [a.id, a])), [snapshot]);
  const key = currentAnchors[0];
  useEffect(() => {
    const anchor = anchorIndex.get(key); if (!autoScroll || !anchor || !scroll.current) return;
    const pageElement = scroll.current.querySelector(`[data-page="${anchor.page}"]`), page = snapshot.pages[anchor.page];
    if (!pageElement || !page) return;
    const rect = pageElement.getBoundingClientRect(), viewport = scroll.current.getBoundingClientRect();
    const y = rect.top - viewport.top + (anchor.box.y - page.offsetY) / page.height * rect.height;
    if (y < 50 || y > viewport.height - 60) scroll.current.scrollTo({top: scroll.current.scrollTop + y - viewport.height / 2, behavior: 'smooth'});
  }, [key, autoScroll, anchorIndex, snapshot]);
  return <div id="sheet-scroll" className={'sheet-scroll ' + (props.selecting ? 'is-selecting' : '')} ref={scroll} aria-label="Bản nhạc chỉ đọc"><div className="sheet-stack">
    {snapshot.pages.map((_, index) => <Page key={index} {...props} index={index} url={urls[index]}/>)}
  </div></div>;
});
