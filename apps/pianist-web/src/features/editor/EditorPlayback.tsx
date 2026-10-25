import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EditorPlaybackState } from '../../../../../packages/engine-bridge';
import { workspace as ws } from '../../workspace';
import { soundSnapshot, subscribeSound } from '../../platform/audio-output';
import {
  editorAudition,
  editorCommand,
  stopEditorPlayback,
  bindEditorPlayback,
} from '../../application/editor-audition';
import { Icon } from '../../shared/ui/Icon';

const time = (n: number) => {
  const s = Math.max(0, Math.floor(n || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export function EditorPlayback() {
  const mode = useSyncExternalStore(subscribeSound, soundSnapshot);
  const sampled = useSyncExternalStore(editorAudition.subscribe, editorAudition.snapshot);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const [state, setState] = useState<EditorPlaybackState>(),
    [error, setError] = useState('');
  const refresh = () => {
    try {
      if (ws.bridge) setState(ws.bridge.playbackState());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  const command = async (name: 'toggle' | 'stop' | 'seek', value = 0) => {
    const serial = ++request.current;
    try {
      if (!ws.bridge) return;
      if (name === 'toggle') setLoading(true);
      await editorCommand(ws.bridge, name, value);
      if (serial !== request.current) return;
      setError('');
      refresh();
    } catch (e) {
      if (serial !== request.current) return;
      setError(String(e instanceof Error ? e.message : e));
      ws.patch({ error: String(e instanceof Error ? e.message : e) });
    } finally {
      if (serial === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 200);
    return () => {
      clearInterval(timer);
      stopEditorPlayback(ws.bridge);
    };
  }, []);
  useEffect(() => {
    if (!ws.bridge) return;
    return bindEditorPlayback(ws.bridge, (e) => {
      const message = String(e instanceof Error ? e.message : e);
      setError(message);
      ws.patch({ error: message });
    });
  }, [ws.bridge, mode]);
  useEffect(
    () =>
      subscribeSound(() => {
        request.current++;
        stopEditorPlayback(ws.bridge);
        setLoading(false);
        setError('');
      }),
    [],
  );
  useEffect(() => {
    request.current++;
    setLoading(false);
    stopEditorPlayback(ws.bridge);
  }, [ws.state.current?.id, ws.state.revision]);
  const display = mode === 'piano' ? sampled : state;
  const ready = !!ws.bridge && !ws.state.busy,
    playing = display?.status === 'playing';
  return (
    <div className="editor-playback" role="region" aria-label="Phát bản nhạc trong editor">
      <button
        className={playing ? '' : 'primary'}
        disabled={!ready || loading}
        onClick={() => command('toggle')}
        title="Phát / tạm dừng · Space"
        aria-label={playing ? 'Tạm dừng phát nhạc' : 'Phát nhạc'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
        {loading ? 'Đang tải…' : playing ? 'Tạm dừng' : 'Nghe'}
      </button>
      <button disabled={!ready} onClick={() => command('stop')} aria-label="Dừng phát nhạc">
        <Icon name="stop" /> Dừng
      </button>
      <span className="editor-playback-time">{time(display?.positionSeconds ?? 0)}</span>
      <input
        type="range"
        aria-label="Vị trí phát nhạc"
        min={0}
        max={display?.durationSeconds || 1}
        step={0.1}
        value={Math.min(display?.positionSeconds ?? 0, display?.durationSeconds || 1)}
        disabled={!ready || !display}
        onChange={(e) => command('seek', +e.target.value)}
      />
      <span className="editor-playback-time">{time(display?.durationSeconds ?? 0)}</span>
      <span className="editor-playback-state" role="status">
        {error ||
          (mode === 'piano' && sampled?.error) ||
          (!ready
            ? 'Đang chuẩn bị âm thanh…'
            : playing
              ? 'Đang phát'
              : display?.status === 'paused'
                ? 'Đã tạm dừng'
                : 'Space để phát')}
      </span>
    </div>
  );
}
