import { useRef, useState } from 'react';
import { workspace as ws } from '../workspace';
import { download } from './files';
import * as storage from './storage';
import { decodeLibrary, encodeLibrary, restoredCopies, type LibraryBackup } from './library-backup';

export function LibraryTransfer() {
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<LibraryBackup>(),
    [status, setStatus] = useState('');
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await ws.run(action);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      setStatus('Đang đóng gói thư viện…');
      await ws.autosave(true);
      const bytes = await encodeLibrary(await storage.librarySnapshot());
      download(
        bytes,
        `pianist-library-${new Date().toISOString().slice(0, 10)}.pianist.zip`,
        'application/zip',
      );
      setStatus('Đã tạo file sao lưu gồm bài nhạc, bản nguồn, bản tự lưu và lịch sử.');
    });
  const inspect = (file: File) =>
    run(async () => {
      setStatus('Đang kiểm tra gói sao lưu…');
      if (file.size > 256 * 1024 * 1024) throw Error('Gói sao lưu vượt giới hạn 256 MiB.');
      const result = await decodeLibrary(new Uint8Array(await file.arrayBuffer()));
      setPreview(result);
      setStatus('Đã kiểm tra cấu trúc và mã kiểm tra file.');
      dialog.current?.showModal();
    });
  const restore = () =>
    run(async () => {
      if (!preview) return;
      await ws.restoreLibrary(restoredCopies(preview));
      setStatus(
        `Đã thêm ${preview.data.projects.length} bài và ${preview.data.sessions.length} lượt tập từ bản sao lưu.`,
      );
      dialog.current?.close();
      setPreview(undefined);
      ws.notice('Đã khôi phục thành các bản riêng. Hãy hiệu chuẩn lại trên thiết bị này.');
    });
  return (
    <section className="library-transfer" aria-label="Sao lưu thư viện">
      <div>
        <strong>Sao lưu và chuyển thiết bị</strong>
        <p>
          Giữ cả bản nguồn, thay đổi tự lưu và lịch sử trong một file. Khôi phục tạo bản riêng, giữ
          nguyên các bài hiện có.
        </p>
      </div>
      <div className="button-row">
        <button disabled={busy} onClick={save}>
          Tải toàn bộ thư viện
        </button>
        <button disabled={busy} onClick={() => input.current?.click()}>
          Khôi phục từ file…
        </button>
      </div>
      <p role="status">{busy ? 'Đang xử lý…' : status}</p>
      <input
        ref={input}
        type="file"
        accept=".zip,.pianist"
        hidden
        aria-label="Gói sao lưu thư viện"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void inspect(file);
        }}
      />
      <dialog ref={dialog} aria-labelledby="restore-library-title">
        <h2 id="restore-library-title">Khôi phục thư viện</h2>
        {preview && (
          <>
            <p>
              Bản sao lưu ngày {new Date(preview.createdAt).toLocaleString('vi')} ·{' '}
              {(preview.bytes / 1024 / 1024).toFixed(1)} MiB
            </p>
            <p>
              <strong>{preview.data.projects.length} bài nhạc</strong> ·{' '}
              {preview.data.recovery.length} bản tự lưu · {preview.data.sessions.length} lượt tập.
            </p>
            <p>
              Mỗi bài được thêm với tên “— khôi phục”. Bài và lịch sử đang có được giữ nguyên. Bù
              trễ MIDI cần đo lại theo đàn và đường âm thanh trên máy này.
            </p>
          </>
        )}
        <div className="dialog-actions">
          <button
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setPreview(undefined);
            }}
          >
            Hủy
          </button>
          <button className="primary" disabled={busy || !preview} onClick={restore}>
            Thêm các bản khôi phục
          </button>
        </div>
      </dialog>
    </section>
  );
}
