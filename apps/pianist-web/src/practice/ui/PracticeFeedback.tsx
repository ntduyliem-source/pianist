import type React from 'react';
import type {
  PracticeSettings,
  EngineView,
  ReleaseJudgement,
  Target,
} from '../../../../../packages/practice-engine-v2';
import { noteName } from '../../platform/midi-v2';

const gradeText = {
  perfect: 'Perfect',
  great: 'Great',
  good: 'Good',
  ok: 'OK',
  meh: 'Meh',
  miss: 'Bỏ lỡ',
};
const releaseText: Record<ReleaseJudgement['status'], string> = {
  correct: 'Nhả đúng',
  early: 'Nhả sớm',
  late: 'Nhả trễ',
  unreleased: 'Chưa nhả',
  interrupted: 'Bị ngắt',
  pending: 'Đang giữ nốt',
  unavailable: 'Chưa có mốc nhả',
  'no-attack': 'Chưa nhận đúng nốt',
};

interface PracticeFeedbackProps {
  config: PracticeSettings;
  view: EngineView;
  active: boolean;
  count: number;
  focus: boolean;
  timing: string;
  expected: number[];
  held: number[];
  missing: number[];
  lastNote?: Target;
  total: number;
  device: string;
  pedalReference: boolean;
  pedalExpected: boolean;
  pedalDown: boolean;
  virtualInput: boolean;
  pedalToggle: React.ReactNode;
  onPedal: () => void;
}
export function PracticeFeedback({
  config: c,
  view,
  active,
  count,
  focus,
  timing,
  expected,
  held,
  missing,
  lastNote,
  total,
  device,
  pedalReference,
  pedalExpected,
  pedalDown,
  virtualInput,
  pedalToggle,
  onPedal,
}: PracticeFeedbackProps) {
  const names = (pitches: number[]) => [...new Set(pitches)].map(noteName).join(' · ') || '—';
  const latest = view.judgements.at(-1),
    release = view.releaseFeedback;
  return (
    <details className="v2-feedback-panel" hidden={focus}>
      <summary>
        <span>
          {count
            ? `Đếm vào ${count}`
            : active
              ? c.mode === 'bpm'
                ? timing
                : `Còn thiếu: ${names(missing)}`
              : `${c.hand === 'both' ? 'Hai tay' : c.hand === 'left' ? 'Tay trái' : 'Tay phải'} · ${device}`}
        </span>
        <span>
          {active ? `${view.judgements.length} nốt · ${view.extras.length} thừa` : 'Phản hồi'} ⌄
        </span>
      </summary>
      <section className="v2-feedback" aria-label="Phản hồi luyện tập">
        <div>
          <span className="v2-label">{c.mode === 'wait' ? 'Hợp âm cần chơi' : 'Nốt vừa chơi'}</span>
          <strong>
            {c.mode === 'wait'
              ? names(expected)
              : lastNote
                ? `${noteName(lastNote.pitch)} · ${latest?.grade === 'miss' ? 'Bỏ lỡ' : 'Đã nhận'}`
                : 'Sẵn sàng nhận phím'}
          </strong>
          <small>
            {c.mode === 'wait'
              ? `Còn thiếu: ${names(missing)}`
              : held.length
                ? `Đang giữ ${names(held)}`
                : `Sắp chơi: ${names(expected)}`}
          </small>
        </div>
        <div>
          <span className="v2-label">{c.mode === 'bpm' ? 'Thời điểm vào nốt' : 'Tiến độ'}</span>
          <strong
            className={
              latest && ['good', 'ok', 'meh', 'miss'].includes(latest.grade) ? 'v2-attention' : ''
            }
          >
            {c.mode === 'bpm' ? timing : `${view.judgements.length} / ${total} nốt`}
          </strong>
          <small>
            {c.mode === 'bpm' && latest ? `${gradeText[latest.grade]} · ` : ''}
            {view.extras.length} phím thừa ·{' '}
            {view.judgements.filter((j) => j.grade === 'miss').length} nốt bỏ lỡ
          </small>
        </div>
        <div>
          <span className="v2-label">Trường độ</span>
          <strong>
            {c.mode === 'wait'
              ? 'Không chấm ở Đúng nốt'
              : c.durationEnabled === false
                ? 'Đã tắt chấm nhả phím'
                : release
                  ? releaseText[release.status]
                  : 'Chờ nốt đầu tiên'}
          </strong>
          <small>
            {release?.deltaMs !== null && release?.deltaMs !== undefined
              ? `${release.deltaMs > 0 ? '+' : ''}${release.deltaMs.toFixed(0)} ms`
              : 'Theo mốc nhả của bản nhạc'}
          </small>
        </div>
      </section>
      <div className="v2-pedal-row" hidden={focus}>
        {pedalToggle}
        <span>
          Bài yêu cầu:{' '}
          <strong>
            {c.pedalEnabled === false
              ? 'Đã tắt'
              : !pedalReference
                ? 'Không có ký hiệu'
                : !active || c.mode === 'wait'
                  ? '—'
                  : pedalExpected
                    ? 'Đạp'
                    : 'Nhả'}
          </strong>
        </span>
        <span>
          Đàn đang:{' '}
          <strong className={pedalDown ? 'v2-pedal-down' : ''}>{pedalDown ? 'Đạp' : 'Nhả'}</strong>
        </span>
        <span className="v2-flex" />
        <button
          disabled={!virtualInput || c.pedalEnabled === false}
          aria-label="Đạp hoặc nhả pedal ảo"
          aria-pressed={pedalDown}
          onClick={onPedal}
        >
          {pedalDown ? 'Nhả pedal' : 'Đạp pedal'}
        </button>
      </div>
    </details>
  );
}
