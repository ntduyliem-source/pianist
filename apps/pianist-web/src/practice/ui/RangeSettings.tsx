import { useEffect, useRef, useState } from 'react';
import type { PracticeSettings } from '../../../../../packages/practice-engine-v2';
import { parseMeasureRange } from '../measure-range';

interface RangeSettingsProps {
  config: PracticeSettings;
  measureCount: number;
  onApply: (range: { fromMeasure: number; toMeasure: number }) => void;
  onSelect: () => void;
  onCancel: () => void;
}
// A local draft: cancel and incomplete input must never change the live timeline.
export function RangeSettings({
  config,
  measureCount,
  onApply,
  onSelect,
  onCancel,
}: RangeSettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(String(config.fromMeasure + 1));
  const [to, setTo] = useState(String(config.toMeasure + 1));
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
          const result = parseMeasureRange(from, to, measureCount);
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
        <p className="range-hint">Bản nhạc có {measureCount} ô nhịp.</p>
        <div className="range-fields">
          <label>
            Từ ô nhịp
            <input
              aria-label="Từ ô nhịp"
              type="number"
              inputMode="numeric"
              min={1}
              max={measureCount}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setError('');
              }}
            />
          </label>
          <span aria-hidden="true">→</span>
          <label>
            Đến ô nhịp
            <input
              aria-label="Đến ô nhịp"
              type="number"
              inputMode="numeric"
              min={1}
              max={measureCount}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setError('');
              }}
            />
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
            onClick={() => onApply({ fromMeasure: 0, toMeasure: measureCount - 1 })}
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
