import { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { SongCollection } from './SongCollection';
import { ThumbnailProvider } from './ScoreThumbnail';
import { LibraryViewSwitch, useLibraryView } from './LibraryView';
import { Icon } from '../../shared/ui/Icon';

export function PracticeHome() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const [search, setSearch] = useState(''),
    [view, setView] = useLibraryView();
  const projects = state.projects.filter(
    (p) => !p.archived && !state.excludedScoreHashes.includes(p.sourceHash ?? ''),
  );
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
          {state.current && !state.excludedScoreHashes.includes(state.current.sourceHash ?? '') && (
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
          <SongCollection
            songs={state.bundledScores}
            projects={projects}
            search={search}
            practice
          />
        </section>
      </main>
    </ThumbnailProvider>
  );
}
