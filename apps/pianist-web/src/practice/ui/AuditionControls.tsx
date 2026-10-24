import type { AuditionState } from '../native-audition';
interface AuditionControlsProps {
  audition: AuditionState;
  startMs: number;
  endMs: number;
  speed: number;
  loop: boolean;
  onSeek: (positionMs: number) => void;
  onSpeed: (speed: number) => void;
  onLoop: () => void;
}
const time = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export function AuditionControls({
  audition,
  startMs,
  endMs,
  speed,
  loop,
  onSeek,
  onSpeed,
  onLoop,
}: AuditionControlsProps) {
  return (
    <div className="v2-audition" role="region" aria-label="Nghe bản nhạc">
      <span className="v2-time">{time(audition.elapsedMs)}</span>
      <input
        type="range"
        aria-label="Vị trí nghe"
        min={Math.floor(startMs)}
        max={Math.ceil(endMs)}
        step={1}
        value={Math.round(audition.positionMs)}
        onChange={(e) => onSeek(+e.target.value)}
      />
      <select
        aria-label="Tốc độ nghe"
        disabled={audition.preparing}
        value={speed}
        onChange={(e) => onSpeed(+e.target.value)}
      >
        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
          <option key={n} value={n}>
            {Math.round(n * 100)}%
          </option>
        ))}
      </select>
      <button aria-label="Lặp khi nghe" aria-pressed={loop} onClick={onLoop}>
        ↻
      </button>
    </div>
  );
}
