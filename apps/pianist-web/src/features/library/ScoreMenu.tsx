import { useRef, type ReactNode } from 'react';

export function ScoreMenu({
  title,
  version,
  filename,
  onEdit,
  children,
}: {
  title: string;
  version: string;
  filename: string;
  onEdit?: () => void;
  children?: (close: () => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  return (
    <div className="score-card-heading">
      <h3 title={title}>{title}</h3>
      <button
        className="score-more"
        aria-label={'Tùy chọn ' + title}
        title="Tùy chọn bài"
        onClick={() => dialog.current?.showModal()}
      >
        ⋯
      </button>
      <dialog ref={dialog} className="score-info" aria-label={'Tùy chọn ' + title}>
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button aria-label="Đóng tùy chọn" onClick={close}>
            ×
          </button>
        </div>
        <p className="score-version-label">{version}</p>
        <div className="score-menu-actions">
          {onEdit && (
            <button
              onClick={() => {
                close();
                onEdit();
              }}
            >
              Chỉnh sửa bản nhạc
            </button>
          )}
          {children?.(close)}
        </div>
        <details className="score-file-info">
          <summary>Thông tin bản nhạc</summary>
          <p>File: {filename}</p>
        </details>
      </dialog>
    </div>
  );
}
