import { useRef, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';

export function MidiStatus({ compact = false }: { compact?: boolean }) {
  useSyncExternalStore(ws.subscribe, ws.snapshot);
  useSyncExternalStore(ws.sessions.subscribe, ws.sessions.snapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const supported =
    typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess ===
      'function' && isSecureContext;
  const midi = ws.midi;
  const device = midi.ports.find((p) => p.id === midi.deviceId);
  const waiting = midi.connection === 'connecting';
  const status = !supported
    ? 'Không hỗ trợ'
    : waiting
      ? 'Đang kết nối'
      : (device?.name ??
        (midi.connection === 'denied'
          ? 'Chưa cấp quyền'
          : midi.connection === 'disconnected'
            ? 'Đã ngắt'
            : 'Chưa kết nối'));
  const locked = !!ws.session && !['ready', 'finished', 'interrupted'].includes(ws.session.status);
  return (
    <>
      <button
        className={'midi-status' + (device ? ' connected' : '') + (compact ? ' compact' : '')}
        aria-label={'MIDI: ' + status}
        title={'MIDI: ' + status}
        onClick={() => dialog.current?.showModal()}
      >
        <span className="connection-dot" aria-hidden="true" />
        <span>MIDI</span>
        {!compact && <span className="midi-device-name">{status}</span>}
      </button>
      <dialog ref={dialog} className="device-dialog" aria-label="Kết nối đàn MIDI">
        <div className="dialog-heading">
          <h2>Đàn MIDI</h2>
          <button aria-label="Đóng MIDI" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </div>
        <p role="status">{device ? `Đã kết nối: ${device.name}` : status}</p>
        {!supported ? (
          <p>
            Trình duyệt này chưa hỗ trợ Web MIDI. Safari trên iPhone/iPad chưa nhận đàn trực tiếp;
            bạn vẫn có thể nghe và dùng bàn phím ảo. Để cắm đàn, dùng trình duyệt hỗ trợ Web MIDI,
            chẳng hạn Chrome/Edge trên máy tính.
          </p>
        ) : (
          <>
            <button disabled={waiting || locked} onClick={() => void ws.run(() => midi.connect())}>
              {waiting ? 'Đang kết nối…' : 'Kết nối MIDI'}
            </button>
            <label>
              Thiết bị MIDI
              <select
                aria-label="Thiết bị MIDI"
                value={midi.deviceId}
                disabled={waiting || locked}
                onChange={(e) => void ws.run(() => midi.select(e.target.value))}
              >
                <option value="virtual">Bàn phím ảo</option>
                {midi.ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {midi.connection === 'ready' && !midi.ports.length && (
              <p>Đã được cấp quyền. Chưa tìm thấy đàn; cắm đàn để danh sách tự cập nhật.</p>
            )}
            {locked && <p>Dừng lượt tập để đổi thiết bị.</p>}
            {midi.connectionError && <p role="alert">{midi.connectionError}</p>}
          </>
        )}
        <p className="muted">Kết nối được giữ khi chuyển giữa Thư viện, Editor và Tập piano.</p>
      </dialog>
    </>
  );
}
