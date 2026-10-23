export type Point = { x: number; y: number };
export const sheetZoom = (zoom: number) => Math.max(25, Math.min(400, Math.round(zoom)));
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Geometry only; note anchors and native layout are never modified by a gesture. */
export function pinchZoom(startZoom: number, startDistance: number, a: Point, b: Point) {
  return sheetZoom((startZoom * distance(a, b)) / Math.max(1, startDistance));
}
