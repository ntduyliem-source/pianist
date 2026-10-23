import React, { useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { SourceLabel } from '../../platform/TuneImportDialog';
import { groupBundledScores, matchesBundledWork } from '../../platform/bundled-library';
import { Icon } from '../../shared/ui/Icon';
import { BundledSongs } from './BundledSongs';
import { projectDate as date } from './presentation';
import { prepareOffline, useOnline } from '../../platform/offline';
import { LibraryTransfer } from '../../platform/LibraryTransfer';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function Library() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot),
    [search, setSearch] = useState(''),
    [trash, setTrash] = useState(false);
  const [offline, setOffline] = useState('');
  const projects = state.projects.filter(
    (p) => !!p.archived === trash && p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="library page">
      <aside className="library-sidebar">
        <div className="sidebar-label">KHÔNG GIAN CỦA BẠN</div>
        <button className={!trash ? 'active' : ''} onClick={() => setTrash(false)}>
          <Icon name="score" />
          Bản nhạc của tôi<span>{state.projects.filter((p) => !p.archived).length}</span>
        </button>
        <button onClick={() => ws.navigate('history')}>
          <Icon name="history" />
          Lịch sử luyện tập
        </button>
        <button className={trash ? 'active' : ''} onClick={() => setTrash(true)}>
          <Icon name="folder" />
          Đã lưu trữ
        </button>
        <div className="sidebar-bottom">
          <span className="small-logo">p</span>
          <p>
            Soạn nhạc có chiều sâu.
            <br />
            Tập đàn có mục tiêu.
          </p>
          <span className="muted">MuseScore engine · MIDI input</span>
        </div>
      </aside>
      <section className="library-content">
        <div className="page-title">
          <div>
            <div className="eyebrow">PIANIST WORKSPACE</div>
            <h1 id="view-heading" tabIndex={-1}>
              {trash ? 'Bản nhạc đã lưu trữ' : 'Bản nhạc của bạn'}
            </h1>
            <p>Nhập bản nhạc, chỉnh sửa và bước vào buổi tập của riêng bạn.</p>
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
        {!trash && (
          <div className="library-hero">
            <div>
              <span className="hero-label">TỪ BẢN NHẠC ĐẾN PHÍM ĐÀN</span>
              <h2>
                Mỗi nốt đúng.
                <br />
                Mỗi nhịp vững hơn.
              </h2>
              <p>
                Hai cách tập: chờ đúng nốt, hoặc giữ nhịp theo BPM.
                <br />
                Bài tập luôn lấy từ phiên bản bạn vừa chỉnh sửa.
              </p>
              <button onClick={run(() => ws.sample())}>
                Mở bài mẫu {state.exampleTitle} <Icon name="arrow" />
              </button>
            </div>
            <div className="hero-staff" aria-hidden="true">
              <div className="staff-lines" />
              <span className="clef">𝄞</span>
              <span className="hero-note n1">♩</span>
              <span className="hero-note n2">♪</span>
              <span className="hero-note n3">♩</span>
              <span className="hero-note n4">♫</span>
              <div className="mini-keys">
                {Array.from({ length: 13 }, (_, i) => (
                  <i
                    key={i}
                    className={[1, 2, 4, 5, 6, 8, 9, 11, 12].includes(i) ? 'with-black' : ''}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="section-top">
          <h2>
            {trash ? 'Có thể khôi phục bất cứ lúc nào' : 'Gần đây'} <span>{projects.length}</span>
          </h2>
          <input
            type="search"
            aria-label="Tìm bản nhạc"
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
                aria-label={'Mở ' + project.title}
                onClick={run(() => ws.openProject(project.id))}
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
                <div className="button-row">
                  {trash ? (
                    <button onClick={run(() => ws.archive(project))}>Khôi phục</button>
                  ) : (
                    <>
                      <button onClick={run(() => ws.openProject(project.id))}>Chỉnh sửa</button>
                      <button
                        className="primary-light"
                        onClick={run(() => ws.openProject(project.id, true))}
                      >
                        <Icon name="play" />
                        Tập
                      </button>
                      <button
                        className="archive"
                        title="Lưu trữ bài (có thể khôi phục)"
                        aria-label={'Lưu trữ ' + project.title}
                        onClick={run(() => ws.archive(project))}
                      >
                        ···
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!trash && (
            <button className="import-card" onClick={() => ws.chooseFile()}>
              <Icon name="upload" />
              <strong>Thêm bản nhạc</strong>
              <span>Thả file vào đây hoặc chọn file</span>
              <small>ABC · MXL · MusicXML · MSCZ · tối đa 32 MiB</small>
            </button>
          )}
        </div>
        {!trash && <BundledSongs search={search} />}
        {!projects.length &&
          search &&
          !groupBundledScores(state.bundledScores).some((w) => matchesBundledWork(w, search)) && (
            <p>Không tìm thấy bài phù hợp.</p>
          )}
        <p className="storage-note">
          Thư viện và bản tự lưu nằm trong trình duyệt này. Tải MSCZ hoặc sao lưu cả thư viện để giữ
          trên máy.
        </p>
        <LibraryTransfer />
        <div className="offline-controls">
          <button onClick={run(() => prepareOffline(setOffline))}>Chuẩn bị dùng offline</button>
          <button
            onClick={run(async () => {
              await useOnline();
              setOffline('Đã chuyển sang dùng online. Tải lại trang để áp dụng.');
            })}
          >
            Dùng online
          </button>
          <span role="status">{offline}</span>
        </div>
      </section>
    </main>
  );
}
