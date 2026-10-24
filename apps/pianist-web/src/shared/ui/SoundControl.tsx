import { useSyncExternalStore } from 'react';
import {
  soundSnapshot,
  subscribeSound,
  setSoundMode,
  unlockSound,
} from '../../platform/audio-output';
import { workspace as ws } from '../../workspace';
export function SoundControl() {
  const mode = useSyncExternalStore(subscribeSound, soundSnapshot);
  useSyncExternalStore(ws.sessions.subscribeStatus, ws.sessions.statusSnapshot);
  const active = !!ws.session && !['ready', 'finished'].includes(ws.session.status);
  return (
    <label
      className="sound-control"
      title={
        active
          ? 'Kết thúc lượt tập để đổi tiếng'
          : 'Bỏ chọn: piano nhẹ từ mẫu âm online. Chọn: tải bộ tiếng MuseScore.'
      }
    >
      <input
        type="checkbox"
        aria-label="Tiếng MuseScore"
        checked={mode === 'musescore'}
        disabled={active}
        onChange={(e) => {
          unlockSound();
          ws.libraryPlayer.stop();
          ws.bridge?.api.Module.driver?.stopPreview();
          ws.bridge?.api.Module.driver?.setMuted?.(!e.target.checked);
          setSoundMode(e.target.checked ? 'musescore' : 'piano');
        }}
      />
      <span>Tiếng MuseScore</span>
    </label>
  );
}
