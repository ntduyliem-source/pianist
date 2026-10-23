import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import type { Marker } from './feedback-v2';
import {
  anchorBounds,
  followTarget,
  scoreSystems,
  type ScoreCursor,
  type ScoreSystem,
} from './score-viewport';
import { NoteInk } from './NoteInk';
import { parseNativeGlyphs, type NativeGlyph } from './note-ink';
interface Props {
  snapshot: ScoreSnapshot;
  markers: Map<string, Marker>;
  cursor?: ScoreCursor;
  zoom: number | 'fit' | 'auto';
  autoScroll: boolean;
  followToken: number;
  fromMeasure: number;
  toMeasure: number;
  selecting: 'a' | 'b' | null;
  onMeasure: (index: number) => void;
}
const Page = memo(function Page({
  snapshot,
  pageIndex,
  systems,
  url,
  glyphs,
  markers,
  cursor,
  zoom,
  available,
  fromMeasure,
  toMeasure,
  selecting,
  onMeasure,
}: Props & {
  pageIndex: number;
  systems: ScoreSystem[];
  url: string;
  glyphs: NativeGlyph[];
  available: number;
}) {
  const element = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    page = snapshot.pages[pageIndex];
  const anchors = useMemo(
    () => snapshot.anchors.filter((a) => a.page === pageIndex && a.visible),
    [snapshot, pageIndex],
  );
  const measures = useMemo(
    () => snapshot.measures.filter((m) => m.page === pageIndex),
    [snapshot, pageIndex],
  );
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: document.getElementById('sheet-scroll'),
      rootMargin: '700px',
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const system = cursor
    ? systems.find((s) => s.page === pageIndex && s.measures.includes(cursor.measure))
    : undefined;
  const current = !!system;
  const natural = page.displayWidth;
  const width =
    zoom === 'fit'
      ? available
      : zoom === 'auto'
        ? Math.max(available, natural)
        : (natural * zoom) / 100;
  const screenUnit = page.width / width;
  return (
    <div
      ref={element}
      className="practice-system practice-page"
      data-page={pageIndex}
      style={{ width, aspectRatio: `${page.width}/${page.height}` }}
    >
      {(visible || current) && (
        <svg
          className="practice-system-svg"
          viewBox={`0 0 ${page.width} ${page.height}`}
          role={selecting ? 'group' : 'img'}
          aria-label={`Bản nhạc trang ${pageIndex + 1}: ô ${measures[0]?.label ?? ''} đến ${measures.at(-1)?.label ?? ''}`}
        >
          <image href={url} x="0" y="0" width={page.width} height={page.height} />
          {measures.map((m) => (
            <rect
              key={m.index}
              data-measure={m.index}
              className={
                'practice-measure' +
                (m.index >= fromMeasure && m.index <= toMeasure ? ' in-range' : '')
              }
              x={m.box.x - page.offsetX}
              y={m.box.y - page.offsetY}
              width={m.box.width}
              height={m.box.height}
              role={selecting ? 'button' : undefined}
              tabIndex={selecting ? 0 : undefined}
              aria-label={selecting ? `Ô ${m.label} · chọn ${selecting.toUpperCase()}` : undefined}
              onKeyDown={(e) => {
                if (selecting && ['Enter', ' '].includes(e.key)) {
                  e.preventDefault();
                  onMeasure(m.index);
                }
              }}
              onClick={() => onMeasure(m.index)}
            >
              <title>
                Ô {m.label}
                {selecting ? ' · chọn ' + selecting.toUpperCase() : ''}
              </title>
            </rect>
          ))}
          <NoteInk glyphs={glyphs} anchors={anchors} markers={markers} />
          {system && cursor && (
            <g data-system={system.id}>
              <line
                className="practice-playhead"
                data-testid="score-playhead"
                x1={cursor.x - page.offsetX}
                x2={cursor.x - page.offsetX}
                y1={system.box.y - page.offsetY - 12}
                y2={system.box.y - page.offsetY + system.box.height + 12}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          {measures
            .filter((m) => m.index === fromMeasure || m.index === toMeasure)
            .map((m) => (
              <g key={'range-' + m.index} className="practice-range-mark">
                <text
                  x={
                    m.box.x -
                    page.offsetX +
                    (m.index === fromMeasure ? 6 * screenUnit : m.box.width - 18 * screenUnit)
                  }
                  y={m.box.y - page.offsetY - 6 * screenUnit}
                  fontSize={12 * screenUnit}
                >
                  {m.index === fromMeasure ? 'A' : ''}
                  {m.index === fromMeasure && m.index === toMeasure
                    ? '–B'
                    : m.index === toMeasure
                      ? 'B'
                      : ''}
                </text>
              </g>
            ))}
        </svg>
      )}
    </div>
  );
});
export const Sheet = memo(function Sheet(props: Props) {
  const { snapshot, cursor, autoScroll, followToken } = props;
  const scroll = useRef<HTMLDivElement>(null),
    [available, setAvailable] = useState(800),
    [size, setSize] = useState(0),
    [suspended, setSuspended] = useState(false);
  const last = useRef({ system: '', measure: -1, visit: -1, token: -1 }),
    lastMove = useRef(0),
    desired = useRef({ top: -1, left: -1 });
  const systems = useMemo(() => scoreSystems(snapshot), [snapshot]),
    anchors = useMemo(() => new Map(snapshot.anchors.map((a) => [a.id, a])), [snapshot]);
  const glyphs = useMemo(() => snapshot.pages.map((p) => parseNativeGlyphs(p.svg)), [snapshot]);
  const urls = useMemo(
    () =>
      snapshot.pages.map((p) => URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }))),
    [snapshot],
  );
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setAvailable(Math.max(160, el.clientWidth - 24));
      setSize((n) => n + 1);
      desired.current = { top: -1, left: -1 };
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSuspended(false);
    last.current.token = -1;
    desired.current = { top: -1, left: -1 };
  }, [followToken, autoScroll]);
  useEffect(() => {
    const el = scroll.current;
    if (!el || !cursor || !autoScroll || suspended) return;
    const system = systems.find((s) => s.measures.includes(cursor.measure));
    if (!system) return;
    const block = el.querySelector<HTMLElement>(`.practice-page[data-page="${system.page}"]`);
    if (!block) return;
    const rect = block.getBoundingClientRect(),
      viewport = el.getBoundingClientRect(),
      page = snapshot.pages[system.page],
      scale = rect.width / page.width,
      offset = rect.top - viewport.top + el.scrollTop;
    const focus = anchorBounds(
        cursor.anchors.flatMap((id) => anchors.get(id) ?? []),
        system.box,
      ),
      top = offset + (system.box.y - page.offsetY) * scale;
    const forced = last.current.token !== followToken;
    const target = followTarget(
      {
        top,
        bottom: top + system.box.height * scale,
        left: block.offsetLeft + (cursor.x - page.offsetX) * scale,
        focusTop: offset + (focus.y - page.offsetY) * scale,
        focusBottom: offset + (focus.y + focus.height - page.offsetY) * scale,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        width: el.clientWidth,
        height: el.clientHeight,
        contentWidth: el.scrollWidth,
        contentHeight: el.scrollHeight,
      },
      forced,
    );
    const jump =
      last.current.visit >= 0 &&
      (cursor.visit < last.current.visit ||
        cursor.visit > last.current.visit + 1 ||
        cursor.measure < last.current.measure);
    const changed =
        Math.abs(target.top - desired.current.top) > 4 ||
        Math.abs(target.left - desired.current.left) > 4,
      needed = Math.abs(target.top - el.scrollTop) > 4 || Math.abs(target.left - el.scrollLeft) > 4;
    if (
      needed &&
      (changed || forced || jump) &&
      (jump || performance.now() - lastMove.current > 220 || forced)
    ) {
      const instant =
        jump ||
        forced ||
        Math.abs(target.top - el.scrollTop) > el.clientHeight * 1.25 ||
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ ...target, behavior: instant ? 'instant' : 'smooth' });
      desired.current = target;
      lastMove.current = performance.now();
    }
    last.current = {
      system: system.id,
      measure: cursor.measure,
      visit: cursor.visit,
      token: followToken,
    };
  }, [
    cursor,
    autoScroll,
    suspended,
    followToken,
    systems,
    snapshot,
    anchors,
    available,
    size,
    props.zoom,
  ]);
  const suspend = () => {
    if (autoScroll) {
      setSuspended(true);
      const el = scroll.current;
      if (el) el.scrollTo({ top: el.scrollTop, left: el.scrollLeft, behavior: 'instant' });
    }
  };
  return (
    <div className="practice-sheet-region">
      <div
        id="sheet-scroll"
        className={'practice-sheet-scroll' + (props.selecting ? ' is-selecting' : '')}
        ref={scroll}
        tabIndex={0}
        aria-label="Bản nhạc chỉ đọc"
        onWheel={suspend}
        onTouchMove={suspend}
        onKeyDown={(e) => {
          if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key))
            suspend();
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          if (e.clientX >= el.getBoundingClientRect().left + el.clientWidth) suspend();
        }}
      >
        <div className="practice-sheet-stack">
          {snapshot.pages.map((page, pageIndex) => (
            <Page
              key={page.index}
              {...props}
              pageIndex={pageIndex}
              systems={systems}
              url={urls[pageIndex]}
              glyphs={glyphs[pageIndex]}
              available={available}
            />
          ))}
        </div>
      </div>
      {autoScroll && suspended && (
        <button
          className="follow-return"
          onClick={() => {
            last.current.token = -1;
            desired.current = { top: -1, left: -1 };
            setSuspended(false);
          }}
        >
          ↳ Tiếp tục theo bài
        </button>
      )}
    </div>
  );
});
