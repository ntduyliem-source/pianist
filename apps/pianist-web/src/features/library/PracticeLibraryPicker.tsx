import React, { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { SourceLabel } from '../../platform/TuneImportDialog';
import { groupBundledScores, matchesBundledWork } from '../../platform/bundled-library';
import { Icon } from '../../shared/ui/Icon';
import { BundledSongs } from './BundledSongs';
import { projectDate as date } from './presentation';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function PracticeHome() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot),
    [search, setSearch] = useState('');
  const projects = state.projects.filter(
    (p) => !p.archived && p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="practice-home page">
      <section className="library-content">
        <div className="page-title">
          <div>
            <div className="eyebrow">PIANO PRACTICE</div>
            <h1 id="view-heading" tabIndex={-1}>
              Chọn bài để tập
            </h1>
            <p>Mở bài trong thư viện hoặc nhập bản nhạc để bắt đầu.</p>
          </div>
          <button className="primary" onClick={() => ws.chooseFile(true)}>
            <Icon name="upload" />
            Nhập bản nhạc để tập
          </button>
        </div>
        {state.current && (
          <div className="practice-current">
            <div>
              <span className="eyebrow">BẢN NHẠC ĐANG MỞ</span>
              <strong>{state.current.title}</strong>
            </div>
            <button className="primary-light" onClick={run(() => ws.practice())}>
              <Icon name="play" />
              Tập bài đang mở
            </button>
          </div>
        )}
        <div className="section-top">
          <h2>
            Bài trong thư viện <span>{projects.length}</span>
          </h2>
          <input
            type="search"
            aria-label="Tìm bài để tập"
            placeholder="Tìm tên bản nhạc…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="score-grid">
          {projects.map((project) => (
            <article className="score-card" key={project.id}>
              <button
                className="score-cover"
                aria-label={'Tập ' + project.title}
                onClick={run(() => ws.openProject(project.id, true))}
              >
                <Icon name="score" />
                <span>{project.title}</span>
                <div className="cover-lines">
                  ━━━━━━━━━━
                  <br />
                  ━━━━━━━━━━
                  <br />
                  ━━━━━━━━━━
                </div>
              </button>
              <div className="score-card-body">
                <h3>{project.title}</h3>
                <SourceLabel project={project} />
                <p>
                  {date(project.updatedAt)} · {Math.round(project.bytes.length / 1024)} KB
                </p>
                <button
                  className="primary-light"
                  aria-label={'Bắt đầu với ' + project.title}
                  onClick={run(() => ws.openProject(project.id, true))}
                >
                  <Icon name="play" />
                  Tập bài này
                </button>
              </div>
            </article>
          ))}
        </div>
        <BundledSongs search={search} practice />
        {!projects.length &&
          !groupBundledScores(state.bundledScores).some((w) => matchesBundledWork(w, search)) && (
            <p className="practice-empty">
              {search
                ? 'Không tìm thấy bài phù hợp.'
                : 'Thư viện chưa có bài. Nhập file hoặc thử bài mẫu để bắt đầu.'}
            </p>
          )}
        <p className="storage-note">
          Màn tập sử dụng bản nhạc chỉ đọc. ABC · MXL · MusicXML · MSCZ · tối đa 32 MiB.
        </p>
      </section>
    </main>
  );
}
