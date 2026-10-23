import type { PracticeSettings } from '../../../../../packages/practice-engine-v2/model';
import { NumberField } from '../NumberField';
interface RangeSettingsProps {
  config: PracticeSettings;
  disabled: boolean;
  measureCount: number;
  onRange: (value: number, side: 'a' | 'b') => void;
  onSelect: (side: 'a' | 'b') => void;
  onSettings: (patch: Partial<PracticeSettings>) => void;
}
export function RangeSettings({
  config: c,
  disabled,
  measureCount,
  onRange,
  onSelect,
  onSettings,
}: RangeSettingsProps) {
  return (
    <fieldset disabled={disabled}>
      <legend>Đoạn A–B và vòng tập</legend>
      <div className="v2-field-pair">
        <label>
          Từ ô
          <NumberField
            aria-label="Từ ô nhịp"
            type="number"
            min={1}
            max={measureCount}
            value={c.fromMeasure + 1}
            onValue={(value) => onRange(value - 1, 'a')}
          />
        </label>
        <label>
          Đến ô
          <NumberField
            aria-label="Đến ô nhịp"
            type="number"
            min={1}
            max={measureCount}
            value={c.toMeasure + 1}
            onValue={(value) => onRange(value - 1, 'b')}
          />
        </label>
      </div>
      <div className="v2-row">
        <button onClick={() => onSelect('a')}>Chọn A trên bài</button>
        <button onClick={() => onSelect('b')}>Chọn B trên bài</button>
      </div>
      <div className="v2-field-pair">
        <label>
          Số vòng
          <NumberField
            aria-label="Số vòng"
            type="number"
            min={1}
            max={10}
            value={c.loops}
            onValue={(value) => onSettings({ loops: value })}
          />
        </label>
        <label>
          Tăng BPM mỗi vòng
          <NumberField
            type="number"
            min={0}
            max={50}
            value={c.loopBpmStep}
            onValue={(value) => onSettings({ loopBpmStep: value })}
          />
        </label>
      </div>
    </fieldset>
  );
}
