interface PedalToggleProps {
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}
export function PedalToggle({ enabled, disabled, onChange }: PedalToggleProps) {
  return (
    <label className="v2-check">
      <input
        aria-label="Dùng pedal khi tập"
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      Pedal
    </label>
  );
}
