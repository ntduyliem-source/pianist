import { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { groupBundledScores, matchesBundledWork } from '../../platform/bundled-library';
import { Icon } from '../../shared/ui/Icon';
import { BundledSongs } from './BundledSongs';
import { ProjectSongs } from './ProjectSongs';
import { ThumbnailProvider } from './ScoreThumbnail';
import { LibraryViewSwitch, useLibraryView } from './LibraryView';
import { prepareOffline, useOnline } from '../../platform/offline';
import { LibraryTransfer } from '../../platform/LibraryTransfer';
import { matchesSearch } from '../../shared/search';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function Library() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const [search, setSearch] = useState(''),
    [trash, setTrash] = useState(false),
    [offline, setOffline] = useState('');
  const [view, setView] = useLibraryView();
  const projects = state.projects.filter((p) => !!p.archived === trash);
  const hasProjectMatch = projects.some((p) => matchesSearch(p.title, search));
  return (
    <ThumbnailProvider>
      <main className={'library library-v2 page library-view-' + view}>
        <section className="library-content">
          <div className="page-title">
            <h1 id="view-heading" tabIndex={-1}>
              Thư viện
            </h1>
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
            <input
              type="search"
              aria-label="Tìm bản nhạc"
              placeholder="Tìm tên bản nhạc…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <LibraryViewSwitch view={view} onChange={setView} />
            <button aria-pressed={trash} onClick={() => setTrash(!trash)}>
              {trash ? 'Về thư viện' : 'Đã lưu trữ'}
            </button>
            <button onClick={() => ws.navigate('history')}>Lịch sử tập</button>
          </div>
          {(projects.length > 0 || trash) && (
            <section aria-label={trash ? 'Bài đã lưu trữ' : 'Bản nhạc của tôi'}>
              <div className="section-top">
                <h2>
                  {trash ? 'Đã lưu trữ' : 'Bản nhạc của tôi'} <span>{projects.length}</span>
                </h2>
              </div>
              <ProjectSongs projects={projects} trash={trash} search={search} />
            </section>
          )}
          {!trash && <BundledSongs search={search} />}
          {!hasProjectMatch &&
            (trash ||
              !groupBundledScores(state.bundledScores).some((w) =>
                matchesBundledWork(w, search),
              )) && (
              <p className="library-empty">
                {search
                  ? 'Không tìm thấy bài phù hợp.'
                  : trash
                    ? 'Chưa có bản nhạc lưu trữ.'
                    : 'Nhập bản nhạc để bắt đầu.'}
              </p>
            )}
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
