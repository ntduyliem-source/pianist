import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../workspace';
import { MidiStatus } from '../shared/ui/MidiStatus';
import { ThemeControl } from '../shared/ui/ThemeControl';
import { LibraryPlayback } from '../features/library/LibraryPlayback';
import { download } from '../platform/files';
import { TuneImportDialog } from '../platform/TuneImportDialog';
import { Practice } from '../practice/PracticeScreen';
import { Results } from '../features/results/ResultsScreen';
import { History } from '../features/results/HistoryScreen';
import { EditorPlayback } from '../features/editor/EditorPlayback';
import { EditorActions } from '../features/editor/EditorActions';
import { Exercises } from '../exercises/Exercises';
import { Library } from '../features/library/LibraryScreen';
import { PracticeHome } from '../features/library/PracticeLibraryPicker';
import { Icon } from '../shared/ui/Icon';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function App() {
  useSyncExternalStore(ws.sessions.subscribeStatus, ws.sessions.statusSnapshot);
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot),
    file = useRef<HTMLInputElement>(null),
    practiceFile = useRef(false),
    exportDialog = useRef<HTMLDialogElement>(null),
    about = useRef<HTMLDialogElement>(null),
    saveAsDialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState('mxl'),
    [dragging, setDragging] = useState(false),
    [copyTitle, setCopyTitle] = useState('');
  useEffect(() => {
    ws.chooseFile = (practice = ws.state.view === 'practice') => {
      practiceFile.current = practice;
      file.current?.click();
    };
    ws.showExport = () => exportDialog.current?.showModal();
    ws.showAbout = () => about.current?.showModal();
    ws.showSaveAs = () => {
      setCopyTitle((ws.state.current?.title ?? 'Bản nhạc') + ' — bản sao');
      saveAsDialog.current?.showModal();
    };
    void ws.init();
    document
      .querySelectorAll('dialog')
      .forEach((dialog) => dialog.addEventListener('close', () => ws.focusEditor()));
    const shortcut = (event: KeyboardEvent) => {
      if (
        state.view !== 'editor' ||
        !(event.ctrlKey || event.metaKey) ||
        document.querySelector('dialog[open]')
      )
        return;
      const k = event.key.toLowerCase();
      const command =
        k === 's'
          ? event.shiftKey
            ? ws.showSaveAs
            : () => ws.saveLibrary()
          : k === 'o'
            ? ws.chooseFile
            : k === 'n'
              ? () => ws.newProject()
              : k === 'e' && event.shiftKey
                ? ws.showExport
                : undefined;
      if (command) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void ws.run(command);
      }
    };
    // This handler reads the current view without reinstalling the application lifecycle.
    const handler = (e: KeyboardEvent) => {
      if (ws.state.view === 'editor') shortcutForEditor(e);
    };
    function shortcutForEditor(event: KeyboardEvent) {
      if (
        event.code === 'Space' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !document.querySelector('dialog[open]')
      ) {
        const target = event.composedPath()[0] as HTMLElement;
        if (
          target?.closest?.('button,input,textarea,select,[contenteditable=true]') &&
          !target.classList.contains('qt-window-focus-helper')
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat && !ws.state.busy && ws.bridge)
          void ws.run(() => {
            ws.bridge!.api.Module.driver?.resume();
            ws.bridge!.playback('toggle');
          });
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || document.querySelector('dialog[open]')) return;
      const k = event.key.toLowerCase(),
        command =
          k === 's'
            ? event.shiftKey
              ? ws.showSaveAs
              : () => ws.saveLibrary()
            : k === 'o'
              ? ws.chooseFile
              : k === 'n'
                ? () => ws.newProject()
                : k === 'e' && event.shiftKey
                  ? ws.showExport
                  : undefined;
      if (command) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void ws.run(command);
      }
    }
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
  useEffect(() => {
    const diagnostics = document.getElementById('diagnostics')!;
    diagnostics.hidden = !new URLSearchParams(location.search).has('diagnostics');
    const actions: Record<string, () => unknown> = {
      snapshot: () => {
        if (ws.state.snapshot)
          download(JSON.stringify(ws.state.snapshot), 'pianist-snapshot.json', 'application/json');
      },
      open: () => ws.chooseFile(),
      sample: async () => {
        const r = await fetch('fixtures/piano.mxl');
        if (!r.ok) throw Error('Fixture unavailable');
        await ws.importFile(new File([await r.blob()], 'piano.mxl'));
      },
      save: () => ws.downloadProject(),
      mxl: () => ws.export('mxl'),
      xml: () => ws.export('musicxml'),
      audio: () => ws.bridge?.api.startAudioProcessing(),
      undo: () => ws.bridge?.api.dispatchAction('undo'),
      redo: () => ws.bridge?.api.dispatchAction('redo'),
      select: () => ws.bridge?.api.dispatchAction('select-all'),
      up: () => ws.bridge?.api.dispatchAction('pitch-up'),
    };
    for (const [id, action] of Object.entries(actions)) {
      const el = document.getElementById(id) as HTMLButtonElement;
      if (el) {
        el.disabled = ['open', 'sample'].includes(id) ? false : !state.engineReady;
        el.onclick = run(action);
      }
    }
  }, [state.engineReady]);
  const active = ws.session && !['ready', 'finished'].includes(ws.session.status);
  return (
    <div
      className={'application view-' + state.view}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!active && e.dataTransfer.files[0])
          void ws.run(() => ws.importFile(e.dataTransfer.files[0], ws.state.view === 'practice'));
      }}
    >
      <header className="appbar">
        <a
          className="brand"
          href="#/library"
          onClick={(e) => {
            e.preventDefault();
            ws.navigate('library');
          }}
        >
          <span className="brand-symbol">p</span>Pianist<span className="edition">WEB</span>
        </a>
        <nav aria-label="Chức năng chính">
          <button
            className={state.view === 'library' ? 'selected' : ''}
            onClick={() => ws.navigate('library')}
            disabled={!!active}
          >
            <Icon name="folder" />
            Thư viện
          </button>
          <button
            className={state.view === 'editor' ? 'selected' : ''}
            disabled={!!active}
            onClick={run(() => ws.openEditor())}
          >
            <Icon name="score" />
            Editor
          </button>
          <button
            className={state.view === 'practice' ? 'selected' : ''}
            disabled={!!active && state.view !== 'practice'}
            onClick={run(() => ws.openPractice())}
          >
            <Icon name="piano" />
            Tập piano
          </button>
        </nav>
        <div className="appbar-end">
          <MidiStatus />
          <ThemeControl />
          <button
            className="icon-button"
            title="Giới thiệu và giấy phép"
            aria-label="Giới thiệu"
            onClick={() => about.current?.showModal()}
          >
            ?
          </button>
        </div>
      </header>
      {state.error && !state.engineFailed && (
        <div className="error-banner" role="alert">
          <span>{state.error}</span>
          <button onClick={() => ws.patch({ error: '' })}>Đóng</button>
          {state.current && (
            <button onClick={run(() => ws.downloadProject())}>Tải bản sao MSCZ</button>
          )}
        </div>
      )}
      {!!state.importDiagnostics?.length && !state.error && !state.busy && (
        <div className="error-banner import-notice" role="status">
          <details>
            <summary>Đã mở ABC · có thay đổi trình bày</summary>
            <ul>
              {state.importDiagnostics.map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
          </details>
          <button onClick={() => ws.patch({ importDiagnostics: undefined })}>Đóng</button>
        </div>
      )}
      {state.engineFailed && (
        <div className="loading-overlay" role="alert">
          <h2>{state.error}</h2>
          <button className="primary" onClick={() => location.reload()}>
            Tải lại trang
          </button>
        </div>
      )}
      {state.view === 'editor' && (
        <EditorActions
          title={state.current?.title}
          saveState={state.saveState}
          onExport={() => exportDialog.current?.showModal()}
        />
      )}
      {state.view === 'editor' && state.engineReady && state.current && (
        <EditorPlayback key={state.current.id} />
      )}
      {state.view === 'library' && <Library />}
      {state.view === 'practice' && (
        <>
          {state.practicePicker && (
            <div className="practice-kind" role="group" aria-label="Cách tập piano">
              <button
                aria-label="Free play"
                aria-pressed={state.practiceKind === 'free'}
                onClick={run(() => ws.selectPracticeKind('free'))}
              >
                <Icon name="score" />
                <span>
                  Free play<small>Chọn bài từ thư viện</small>
                </span>
              </button>
              <button
                aria-label="Theo grade"
                aria-pressed={state.practiceKind === 'grade'}
                onClick={run(() => ws.selectPracticeKind('grade'))}
              >
                <Icon name="piano" />
                <span>
                  Theo grade<small>Đọc nhạc từ G1 đến G8</small>
                </span>
              </button>
            </div>
          )}
          {state.practiceKind === 'grade' ? (
            <Exercises />
          ) : state.practicePicker || !state.snapshot || !state.config ? (
            <PracticeHome />
          ) : (
            <Practice
              key={state.snapshot.fingerprint + ':' + state.snapshot.revision}
              snapshot={state.snapshot}
              config={state.config}
            />
          )}
        </>
      )}
      {state.view === 'results' && state.result && <Results result={state.result} />}
      {state.view === 'history' && <History />}
      {state.busy && !state.tuneSelection && (
        <div className="loading-overlay" role="status">
          <span className="brand-symbol">p</span>
          <h2>{state.busy}</h2>
          <div className="loading-bar" />
          <p>File được xử lý ngay trong trình duyệt.</p>
          {state.canCancelOpen && (
            <button onClick={() => ws.cancelOpen()}>
              {state.cancelOpenLabel ?? 'Hủy mở file'}
            </button>
          )}
        </div>
      )}
      {state.tuneSelection && (
        <TuneImportDialog key={state.tuneSelection.requestId} selection={state.tuneSelection} />
      )}
      {dragging && (
        <div className="drop-overlay">
          <Icon name="upload" />
          <h2>Thả bản nhạc để mở</h2>
          <p>ABC · MXL · MusicXML · MSCZ</p>
        </div>
      )}
      {state.toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          {state.toast}
        </div>
      )}
      <input
        id="file"
        ref={file}
        type="file"
        accept=".abc,.mxl,.xml,.musicxml,.mscz,.mscx"
        aria-label="Mở file bản nhạc"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ws.run(() => ws.importFile(f, practiceFile.current));
          e.target.value = '';
        }}
      />
      <dialog ref={exportDialog} aria-labelledby="export-title">
        <h2 id="export-title">Xuất bản nhạc</h2>
        <label htmlFor="export-format">Định dạng</label>
        <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="mxl">MusicXML nén (.mxl)</option>
          <option value="musicxml">MusicXML (.musicxml)</option>
          <option value="pdf">PDF · bản in</option>
          <option value="abc">ABC notation (.abc)</option>
        </select>
        <p>Xuất nội dung đang mở. MSCZ giữ đầy đủ thiết lập và dữ liệu MuseScore.</p>
        {format === 'abc' && (
          <p className="abc-export-warning" role="note">
            ABC có thể thay đổi bố cục trang, font, khoảng cách và cách trình bày. Ứng dụng sẽ mở
            lại bản chuyển đổi để đối chiếu nốt, bè, nhịp, lặp, nhả phím và pedal; nếu không bảo
            toàn được sẽ dừng xuất và báo lý do.
          </p>
        )}
        <div className="dialog-actions">
          <button onClick={() => exportDialog.current?.close()}>Hủy</button>
          <button
            className="primary"
            onClick={run(() => {
              exportDialog.current?.close();
              return ws.export(format);
            })}
          >
            Xuất file
          </button>
        </div>
      </dialog>
      <dialog ref={saveAsDialog} aria-labelledby="save-as-title">
        <h2 id="save-as-title">Lưu thành bản nhạc mới</h2>
        <label htmlFor="copy-title">Tên trong thư viện</label>
        <input
          id="copy-title"
          aria-label="Tên bản mới"
          autoFocus
          value={copyTitle}
          maxLength={150}
          onChange={(e) => setCopyTitle(e.target.value)}
        />
        <p>
          Bản mới có lịch sử luyện tập riêng. Các thay đổi và undo hiện tại của editor được giữ lại.
        </p>
        <div className="dialog-actions">
          <button onClick={() => saveAsDialog.current?.close()}>Hủy</button>
          <button
            className="primary"
            disabled={!copyTitle.trim()}
            onClick={run(async () => {
              await ws.saveAs(copyTitle);
              saveAsDialog.current?.close();
            })}
          >
            Lưu bản mới
          </button>
        </div>
      </dialog>
      {(state.view === 'library' || (state.view === 'practice' && state.practicePicker)) && (
        <LibraryPlayback />
      )}
      <dialog ref={about}>
        <h2>Pianist Web</h2>
        <p>
          Editor dựa trên MuseScore Studio 4.7.5. Tập piano là chức năng riêng, sử dụng bản nhạc chỉ
          đọc.
        </p>
        <p>
          <a href="LICENSE.txt" target="_blank" rel="noreferrer">
            GPL v3
          </a>{' '}
          ·{' '}
          <a href="practice-sources/piano-trainer-studio/LICENSE" target="_blank" rel="noreferrer">
            AGPL v3 · Wait
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/ntduyliem-source/pianist/tree/pianist/m0-web"
            target="_blank"
            rel="noreferrer"
          >
            Mã nguồn & hướng dẫn build
          </a>
        </p>
        <p className="muted">
          BPM dùng osu!mania; Đúng nốt dùng Piano Trainer Studio. Nhả phím và pedal dùng mir_eval,
          Magenta note-seq và mốc MuseScore. Chưa chấm half-pedal hoặc diễn cảm nâng cao. Tối ưu cho
          Chrome/Edge trên máy tính.
        </p>
        <div className="dialog-actions">
          <button onClick={() => about.current?.close()}>Đóng</button>
        </div>
      </dialog>
    </div>
  );
}
