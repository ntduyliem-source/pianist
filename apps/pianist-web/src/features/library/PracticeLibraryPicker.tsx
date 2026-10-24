import { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { BundledSongs } from './BundledSongs';
import { ProjectSongs } from './ProjectSongs';
import { ThumbnailProvider } from './ScoreThumbnail';
import { LibraryViewSwitch, useLibraryView } from './LibraryView';
import { matchesSearch } from '../../shared/search';
import { groupBundledScores, matchesBundledWork } from '../../platform/bundled-library';
import { Icon } from '../../shared/ui/Icon';

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
            <div className="studio-page-heading">
              <span className="eyebrow">FREE PLAY</span>
              <h1 id="view-heading" tabIndex={-1}>
                Chọn bài để tập
              </h1>
              <p>Mở một bản nhạc, chọn đoạn và bắt đầu chơi.</p>
            </div>
            <button className="primary" onClick={() => ws.chooseFile(true)}>
              <Icon name="upload" />
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
            <label className="library-search-wrap">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Tìm bài để tập"
                placeholder="Tìm tên bản nhạc…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
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
          {!projects.some((p) => matchesSearch(p.title, search)) &&
            !groupBundledScores(state.bundledScores).some((w) => matchesBundledWork(w, search)) && (
              <p className="library-empty">Không tìm thấy bài phù hợp.</p>
            )}
        </section>
      </main>
    </ThumbnailProvider>
  );
}
