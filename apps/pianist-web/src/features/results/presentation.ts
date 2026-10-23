import type { ReleaseJudgement } from '../../../../../packages/practice-engine-v2';

export const percent = (n: number | null) => (n === null ? '—' : (n * 100).toFixed(1) + '%');
export const date = (n: number) => new Date(n).toLocaleString('vi');
export const gradeText = {
  perfect: 'Perfect',
  great: 'Great',
  good: 'Good',
  ok: 'OK',
  meh: 'Meh',
  miss: 'Miss',
};
export const releaseText: Record<ReleaseJudgement['status'], string> = {
  correct: 'Đúng nhả',
  early: 'Nhả sớm',
  late: 'Nhả trễ',
  unreleased: 'Chưa nhả',
  interrupted: 'Bị ngắt',
  pending: 'Đang giữ',
  unavailable: 'Thiếu mốc native',
  'no-attack': 'Chưa đánh đúng nốt',
};
export const releaseDelta = (ms: number) =>
  Math.abs(ms) < 0.05 ? '0.0' : `${ms > 0 ? '+' : ''}${ms.toFixed(1)}`;
export const releaseLabel = (r?: ReleaseJudgement) =>
  r
    ? `${releaseText[r.status]}${r.deltaMs !== null && ['correct', 'early', 'late'].includes(r.status) ? ` · ${releaseDelta(r.deltaMs)} ms` : ''}`
    : '—';
