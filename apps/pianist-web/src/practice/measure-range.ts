import type { Measure } from '../../../../packages/score-contracts';

export type MeasureLabel = Pick<Measure, 'index' | 'label'>;

/** Native score labels are presentation; indices remain the practice identity. */
export function measureLabel(measures: readonly MeasureLabel[] | undefined, index: number): string {
  const measure = measures?.find((m) => m.index === index && Number.isSafeInteger(m.label));
  // Historical attempts have no native labels. Do not invent a printed number.
  if (!measure) return `thứ ${index + 1}`;
  return measures!.some((m) => m.index !== index && m.label === measure.label)
    ? `${measure.label} (ô thứ ${index + 1})`
    : String(measure.label);
}

export function matchingMeasures(text: string, measures: readonly MeasureLabel[]): MeasureLabel[] {
  if (!/^-?\d+$/.test(text.trim()) || !Number.isSafeInteger(Number(text))) return [];
  return measures.filter((measure) => measure.label === Number(text));
}

export function parseMeasureRange(
  from: string,
  to: string,
  measures: readonly MeasureLabel[],
  choices: { fromIndex?: number; toIndex?: number } = {},
): { fromMeasure: number; toMeasure: number } | string {
  const resolve = (text: string, choice: number | undefined): number | string => {
    const matches = matchingMeasures(text, measures);
    if (!matches.length)
      return 'Không có ô mang số này. Nhập số trên sheet hoặc chọn trực tiếp trên sheet.';
    if (matches.length === 1) return matches[0].index;
    if (matches.some((measure) => measure.index === choice)) return choice!;
    return `Số ô ${Number(text)} xuất hiện ${matches.length} lần. Chọn đúng vị trí bên dưới.`;
  };
  const a = resolve(from, choices.fromIndex),
    b = resolve(to, choices.toIndex);
  if (typeof a === 'string') return a;
  if (typeof b === 'string') return b;
  if (a > b) return 'Ô kết thúc phải nằm bằng hoặc sau ô bắt đầu trên sheet.';
  return { fromMeasure: a, toMeasure: b };
}
