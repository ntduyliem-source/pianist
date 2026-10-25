import { useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { download } from '../../platform/files';
import './pending-attempts.css';

/** A failed save outlives the sheet/session that produced it. Keep recovery
 * actions reachable after navigating to another song, mode or tab. */
export function PendingAttempts() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const failed = state.pendingAttempts.filter((item) => !!item.error || !item.saving);
  if (!failed.length) return null;
  return (
    <aside className="pending-attempts" aria-label="Kết quả chưa lưu">
      <strong role="alert">Có {failed.length} lượt tập chưa lưu</strong>
      <p>Đang giữ trong tab này. Lưu lại hoặc tải JSON trước khi đóng hay tải lại trang.</p>
      {failed.map((item) => (
        <div className="pending-attempt" key={item.result.id}>
          <span>
            <strong>{item.result.title}</strong>
            <small>{item.error || 'Đang lưu lại…'}</small>
          </span>
          <button
            disabled={item.saving}
            onClick={() => void ws.retryPendingAttempt(item.result.id)}
          >
            {item.saving ? 'Đang lưu…' : 'Lưu lại'}
          </button>
          <button
            onClick={() =>
              download(
                JSON.stringify(item.result, null, 2),
                `pianist-result-${item.result.id}.json`,
                'application/json',
              )
            }
          >
            Tải JSON
          </button>
        </div>
      ))}
    </aside>
  );
}
