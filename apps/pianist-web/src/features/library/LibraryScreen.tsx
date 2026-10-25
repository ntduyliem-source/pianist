import { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { Icon } from '../../shared/ui/Icon';
import { SongCollection } from './SongCollection';
import { ThumbnailProvider } from './ScoreThumbnail';
import { LibraryViewSwitch, useLibraryView } from './LibraryView';
import { prepareOffline, useOnline } from '../../platform/offline';
import { LibraryTransfer } from '../../platform/LibraryTransfer';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function Library() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const [search, setSearch] = useState(''),
    [trash, setTrash] = useState(false),
    [offline, setOffline] = useState('');
  const [view, setView] = useLibraryView();
  const projects = state.projects.filter(
    (p) => !!p.archived === trash && !state.excludedScoreHashes.includes(p.sourceHash ?? ''),
  );
  return (
    <ThumbnailProvider>
      <main className={'library library-v2 page library-view-' + view}>
        <section className="library-content">
          <div className="page-title">
            <div className="studio-page-heading">
              <span className="eyebrow">KHÔNG GIAN ÂM NHẠC CỦA BẠN</span>
              <h1 id="view-heading" tabIndex={-1}>
                Thư viện
              </h1>
              <p>Nghe, biên soạn và luyện tập những bản nhạc bạn yêu thích.</p>
            </div>
            <div className="button-row">
              <button onClick={run(() => ws.newProject())}>
                <Icon name="add" />
                Bản nhạc mới
              </button>
              <button className="primary" onClick={() => ws.chooseFile()}>
                <Icon name="upload" />
                Nhập bản nhạc
              </button>
            </div>
          </div>
          <div className="library-toolbar">
            <label className="library-search-wrap">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Tìm bản nhạc"
                placeholder="Tìm bài, tác giả, người chuyển soạn…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <LibraryViewSwitch view={view} onChange={setView} />
            <span className="toolbar-spacer" />
            <button aria-pressed={trash} onClick={() => setTrash(!trash)}>
              {trash ? 'Về thư viện' : 'Đã lưu trữ'}
            </button>
            <button onClick={() => ws.navigate('history')}>
              <Icon name="history" />
              Lịch sử tập
            </button>
          </div>
          <SongCollection
            songs={trash ? [] : state.bundledScores}
            projects={projects}
            trash={trash}
            search={search}
          />
          <details className="library-tools">
            <summary>Sao lưu, offline và bài mẫu</summary>
            <p className="storage-note">
              Bản nhạc của bạn được lưu trên thiết bị. Sao lưu để chuyển máy hoặc giữ một bản riêng.
            </p>
            <LibraryTransfer />
            <div className="offline-controls">
              <button onClick={run(() => prepareOffline(setOffline))}>Chuẩn bị dùng offline</button>
              <button
                onClick={run(async () => {
                  await useOnline();
                  setOffline('Đã chuyển sang online. Tải lại trang để áp dụng.');
                })}
              >
                Dùng online
              </button>
              <button onClick={run(() => ws.sample())}>Mở bài mẫu {state.exampleTitle}</button>
              <span role="status">{offline}</span>
            </div>
          </details>
        </section>
      </main>
    </ThumbnailProvider>
  );
}
