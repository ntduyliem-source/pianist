import { useRef } from 'react';
import { workspace as ws } from '../../workspace';
import { ScoreCredits } from '../../shared/ui/ScoreCredits';
import { creditSummary } from '../../shared/score-metadata';

export function EditorActions({
  title,
  saveState,
  onExport,
}: {
  title?: string;
  saveState: string;
  onExport: () => void;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const close = () => menu.current?.close();
  const action = (fn: () => unknown) => () => {
    close();
    void ws.run(fn);
  };
  return (
    <div className="editor-meta">
      <strong title={[title, creditSummary(ws.currentCredits())].filter(Boolean).join(' — ')}>
        {title}
      </strong>
      <span data-testid="save-state">{saveState}</span>
      <button aria-label="Lưu thư viện" onClick={action(() => ws.saveLibrary())}>
        Lưu
      </button>
      <div className="editor-desktop-actions">
        <button onClick={() => ws.showSaveAs()}>Lưu bản mới…</button>
        <button onClick={action(() => ws.downloadProject())}>Tải MSCZ</button>
        <button onClick={onExport}>Xuất…</button>
      </div>
      <button
        className="editor-more"
        aria-label="Thêm thao tác editor"
        onClick={() => menu.current?.showModal()}
      >
        •••
      </button>
      <button className="primary" aria-label="Tập bài này" onClick={action(() => ws.practice())}>
        Tập <span className="editor-desktop-label">bài này</span> ↗
      </button>
      <dialog
        ref={menu}
        className="editor-actions-dialog"
        aria-labelledby="editor-actions-title"
        onClose={() => ws.focusEditor()}
      >
        <h2 id="editor-actions-title">Bản nhạc</h2>
        <p>
          {title} · {saveState}
        </p>
        <ScoreCredits value={ws.currentCredits()} />
        <button onClick={action(() => ws.showSaveAs())}>Lưu thành bản mới…</button>
        <button onClick={action(() => ws.downloadProject())}>Tải MSCZ</button>
        <button onClick={action(onExport)}>Xuất MusicXML / ABC / PDF…</button>
        <button onClick={close}>Đóng</button>
      </dialog>
    </div>
  );
}
