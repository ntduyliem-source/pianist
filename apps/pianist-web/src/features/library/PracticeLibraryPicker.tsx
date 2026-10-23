import { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { BundledSongs } from './BundledSongs';
import { ProjectSongs } from './ProjectSongs';
import { ThumbnailProvider } from './ScoreThumbnail';
import { LibraryViewSwitch, useLibraryView } from './LibraryView';

export function PracticeHome() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const [search, setSearch] = useState(''),
    [view, setView] = useLibraryView();
  const projects = state.projects.filter((p) => !p.archived);
  return (
    <ThumbnailProvider>
      <main className={'practice-home library-v2 page library-view-' + view}>
        <section className="library-content">
          <div className="page-title">
            <h1 id="view-heading" tabIndex={-1}>
              Chọn bài để tập
            </h1>
            <button className="primary" onClick={() => ws.chooseFile(true)}>
              Nhập bản nhạc để tập
            </button>
          </div>
          {state.current && (
            <div className="practice-current">
              <strong>{state.current.title}</strong>
              <button onClick={() => void ws.run(() => ws.practice())}>Tập bài đang mở</button>
            </div>
          )}
          <div className="library-toolbar">
            <input
              type="search"
              aria-label="Tìm bài để tập"
              placeholder="Tìm tên bản nhạc…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <LibraryViewSwitch view={view} onChange={setView} />
          </div>
          {projects.length > 0 && (
            <section aria-label="Bản nhạc của tôi">
              <div className="section-top">
                <h2>Bản nhạc của tôi</h2>
              </div>
              <ProjectSongs projects={projects} practice search={search} />
            </section>
          )}
          <BundledSongs search={search} practice />
        </section>
      </main>
    </ThumbnailProvider>
  );
}
