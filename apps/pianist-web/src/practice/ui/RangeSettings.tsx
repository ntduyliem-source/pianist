import { useEffect, useRef, useState } from 'react';
import type { PracticeSettings } from '../../../../../packages/practice-engine-v2';
import {
  matchingMeasures,
  measureLabel,
  parseMeasureRange,
  type MeasureLabel,
} from '../measure-range';

interface RangeSettingsProps {
  config: PracticeSettings;
  measures: readonly MeasureLabel[];
  onApply: (range: { fromMeasure: number; toMeasure: number }) => void;
  onSelect: () => void;
  onCancel: () => void;
}
// A local draft: cancel and incomplete input must never change the live timeline.
export function RangeSettings({
  config,
  measures,
  onApply,
  onSelect,
  onCancel,
}: RangeSettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(
    String(measures.find((m) => m.index === config.fromMeasure)?.label ?? ''),
  );
  const [to, setTo] = useState(
    String(measures.find((m) => m.index === config.toMeasure)?.label ?? ''),
  );
  const [fromIndex, setFromIndex] = useState<number | undefined>(config.fromMeasure);
  const [toIndex, setToIndex] = useState<number | undefined>(config.toMeasure);
  const fromMatches = matchingMeasures(from, measures),
    toMatches = matchingMeasures(to, measures);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="range-dialog" aria-labelledby="range-title" onCancel={onCancel}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const result = parseMeasureRange(from, to, measures, { fromIndex, toIndex });
          if (typeof result === 'string') setError(result);
          else onApply(result);
        }}
      >
        <div className="range-heading">
          <h2 id="range-title">Chọn đoạn tập</h2>
          <button type="button" aria-label="Đóng chọn đoạn" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="range-hint">Nhập số ô nhịp trên sheet, kể cả ô lấy đà số 0.</p>
        <div className="range-fields">
          <label>
            Từ ô nhịp
            <input
              aria-label="Từ ô nhịp"
              type="number"
              inputMode="numeric"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setFromIndex(undefined);
                setError('');
              }}
            />
            {fromMatches.length > 1 && (
              <select
                aria-label="Vị trí ô bắt đầu"
                value={fromIndex ?? ''}
                onChange={(e) => {
                  setFromIndex(e.target.value === '' ? undefined : Number(e.target.value));
                  setError('');
                }}
              >
                <option value="">Chọn vị trí ô {from}</option>
                {fromMatches.map((m) => (
                  <option key={m.index} value={m.index}>
                    Ô {measureLabel(measures, m.index)}
                  </option>
                ))}
              </select>
            )}
          </label>
          <span aria-hidden="true">→</span>
          <label>
            Đến ô nhịp
            <input
              aria-label="Đến ô nhịp"
              type="number"
              inputMode="numeric"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setToIndex(undefined);
                setError('');
              }}
            />
            {toMatches.length > 1 && (
              <select
                aria-label="Vị trí ô kết thúc"
                value={toIndex ?? ''}
                onChange={(e) => {
                  setToIndex(e.target.value === '' ? undefined : Number(e.target.value));
                  setError('');
                }}
              >
                <option value="">Chọn vị trí ô {to}</option>
                {toMatches.map((m) => (
                  <option key={m.index} value={m.index}>
                    Ô {measureLabel(measures, m.index)}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        {error && (
          <p className="range-error" role="alert">
            {error}
          </p>
        )}
        <div className="range-shortcuts">
          <button type="button" onClick={onSelect}>
            Chọn trên sheet
          </button>
          <button
            type="button"
            onClick={() =>
              onApply({ fromMeasure: measures[0].index, toMeasure: measures.at(-1)!.index })
            }
          >
            Toàn bài
          </button>
        </div>
        <div className="range-footer">
          <button type="button" onClick={onCancel}>
            Hủy
          </button>
          <button type="submit" className="primary">
            Áp dụng
          </button>
        </div>
      </form>
    </dialog>
  );
}
