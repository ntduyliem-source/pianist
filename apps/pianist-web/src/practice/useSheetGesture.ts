import { useLayoutEffect, useRef, type RefObject, type PointerEvent } from 'react';
import { distance, midpoint, pinchZoom, type Point } from './sheet-gesture';

export function useSheetGesture(
  scroll: RefObject<HTMLDivElement | null>,
  zoom: number | 'auto' | 'fit',
  naturalWidth: number,
  onZoom: (zoom: number) => void,
  suspend: () => void,
) {
  const points = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const origin = useRef<Point | undefined>(undefined);
  const pinch = useRef<
    | {
        distance: number;
        zoom: number;
        page: HTMLElement;
        x: number;
        y: number;
        center: Point;
      }
    | undefined
  >(undefined);
  const latest = useRef({ onZoom, suspend });
  latest.current = { onZoom, suspend };
  const anchor = () => {
    const p = pinch.current,
      el = scroll.current;
    if (!p || !el || !p.page.isConnected) return;
    const box = p.page.getBoundingClientRect();
    // Anchor to a page-local point: preceding pages also resize, so scaling
    // scrollTop alone would drift when zooming page two or later.
    el.scrollLeft += box.left + p.x * box.width - p.center.x;
    el.scrollTop += box.top + p.y * box.height - p.center.y;
  };
  useLayoutEffect(anchor, [zoom, scroll]);

  const beginPinch = () => {
    const el = scroll.current;
    const pair = [...points.current.values()];
    if (!el || pair.length !== 2) return;
    const center = midpoint(pair[0], pair[1]);
    const pages = [...el.querySelectorAll<HTMLElement>('.practice-page')];
    const page =
      pages.find((p) => {
        const r = p.getBoundingClientRect();
        return center.y >= r.top && center.y <= r.bottom;
      }) ?? pages[0];
    if (!page) return;
    const box = page.getBoundingClientRect();
    const first = pages[0].getBoundingClientRect();
    pinch.current = {
      distance: distance(pair[0], pair[1]),
      zoom: (first.width / naturalWidth) * 100,
      page,
      x: (center.x - box.left) / box.width,
      y: (center.y - box.top) / box.height,
      center,
    };
    moved.current = true;
    latest.current.suspend();
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!points.current.delete(event.pointerId)) return;
    pinch.current = undefined;
    origin.current = [...points.current.values()][0];
    if (points.current.size === 2) beginPinch();
  };
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType !== 'touch') {
        moved.current = false;
        return;
      }
      if (!points.current.size) {
        moved.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
      }
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // Preserve the original target for a stationary A/B selection tap.
      (event.target as Element).setPointerCapture?.(event.pointerId);
      if (points.current.size === 2) beginPinch();
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const previous = points.current.get(event.pointerId),
        el = scroll.current;
      if (!previous || !el) return;
      const next = { x: event.clientX, y: event.clientY };
      points.current.set(event.pointerId, next);
      const pair = [...points.current.values()];
      const p = pinch.current;
      if (pair.length >= 2 && p) {
        p.center = midpoint(pair[0], pair[1]);
        // Two fingers may pan without changing the rounded zoom percentage.
        anchor();
        latest.current.onZoom(pinchZoom(p.zoom, p.distance, pair[0], pair[1]));
      } else if (pair.length === 1) {
        if (!moved.current && origin.current && distance(origin.current, next) <= 5) return;
        latest.current.suspend();
        const prior = moved.current ? previous : (origin.current ?? previous);
        el.scrollLeft += prior.x - next.x;
        el.scrollTop += prior.y - next.y;
        moved.current = true;
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (moved.current) {
        moved.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
