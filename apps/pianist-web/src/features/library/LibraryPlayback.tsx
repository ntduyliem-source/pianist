import { useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import type { LibraryTrack } from '../../application/library-player';
import {
  loadBundledScore,
  bundledVersionLabel,
  type BundledScore,
} from '../../platform/bundled-library';
import * as storage from '../../platform/storage';

export const bundledTrack = (song: BundledScore): LibraryTrack => ({
  id: 'bundled:' + song.id,
  title: song.title,
  version: bundledVersionLabel(song),
  load: async (signal) => ({
    bytes: await loadBundledScore(song, signal),
    filename: song.filename,
  }),
});
export const projectTrack = (project: storage.ProjectRecord, version: string): LibraryTrack => ({
  id: `project:${project.id}:${project.revision}`,
  title: project.title,
  version,
  load: async (signal) => {
    await ws.autosave(true);
    signal.throwIfAborted();
    const recovery = await storage.get<storage.RecoveryRecord>('recovery', project.id);
    signal.throwIfAborted();
    const record = recovery && recovery.revision > project.revision ? recovery : project;
    return { bytes: record.bytes, filename: record.filename };
  },
});
export function ListenButton({ track }: { track: LibraryTrack }) {
  const player = ws.libraryPlayer;
  const activity = useSyncExternalStore(player.subscribeActivity, player.activitySnapshot);
  const selected = activity.id === track.id;
  return (
    <button
      className="library-listen"
      aria-label={(selected && activity.status === 'playing' ? 'Tạm dừng ' : 'Nghe ') + track.title}
      aria-pressed={selected && activity.status === 'playing'}
      disabled={selected && activity.loading}
      onClick={() => void ws.run(() => player.play(track))}
    >
      {selected && activity.loading ? '…' : selected && activity.status === 'playing' ? 'Ⅱ' : '▶'}
      <span>
        {selected && activity.loading
          ? 'Đang tải'
          : selected && activity.status === 'playing'
            ? 'Pause'
            : 'Nghe'}
      </span>
    </button>
  );
}
const time = (ms: number) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export function LibraryPlayback() {
  const player = ws.libraryPlayer,
    state = useSyncExternalStore(player.subscribe, player.snapshot);
  if (!state.track) return null;
  return (
    <div className="library-player" role="region" aria-label="Nghe nhạc thư viện">
      <div className="library-player-title">
        <strong>{state.track.title}</strong>
        <small>{state.track.version}</small>
      </div>
      <button
        disabled={state.loading}
        aria-label={state.status === 'playing' ? 'Tạm dừng nghe thư viện' : 'Phát nghe thư viện'}
        onClick={() => void ws.run(() => player.toggle())}
      >
        {state.loading ? '…' : state.status === 'playing' ? 'Ⅱ' : '▶'}
      </button>
      <button aria-label="Dừng nghe thư viện" onClick={() => void ws.run(() => player.stop())}>
        ■ Stop
      </button>
      <span className="library-player-time">{time(state.positionMs)}</span>
      <input
        type="range"
        aria-label="Vị trí nghe thư viện"
        min={0}
        max={Math.ceil(state.durationMs) || 1}
        step={1}
        value={Math.round(state.positionMs)}
        disabled={state.loading || !state.durationMs}
        onChange={(e) => void ws.run(() => player.seek(+e.target.value))}
      />
      <span className="library-player-time">{time(state.durationMs)}</span>
      {(state.loading || state.error) && (
        <span role={state.error ? 'alert' : 'status'}>
          {state.error || 'Đang chuẩn bị tiếng MuseScore…'}
        </span>
      )}
    </div>
  );
}
