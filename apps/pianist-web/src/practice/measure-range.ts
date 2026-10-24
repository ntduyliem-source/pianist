export function parseMeasureRange(
  from: string,
  to: string,
  count: number,
): { fromMeasure: number; toMeasure: number } | string {
  const a = Number(from),
    b = Number(to);
  if (
    !from.trim() ||
    !to.trim() ||
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 1 ||
    b < 1 ||
    a > count ||
    b > count
  )
    return `Nhập số ô nhịp từ 1 đến ${count}.`;
  if (a > b) return 'Ô kết thúc phải bằng hoặc sau ô bắt đầu.';
  return { fromMeasure: a - 1, toMeasure: b - 1 };
}
