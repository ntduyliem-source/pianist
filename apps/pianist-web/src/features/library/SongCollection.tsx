import { useMemo, useState } from 'react';
import { workspace as ws } from '../../workspace';
import type { BundledScore } from '../../platform/bundled-library';
import type { ProjectRecord } from '../../platform/storage';
import { libraryCollection, type LibraryWork } from './library-collection';
import { bundledTrack, projectTrack, ListenButton } from './LibraryPlayback';
import { ScoreThumbnail } from './ScoreThumbnail';

export function SongCollection({
  songs = [],
  projects,
  search,
  practice = false,
  trash = false,
}: {
  songs?: BundledScore[];
  projects: ProjectRecord[];
  search: string;
  practice?: boolean;
  trash?: boolean;
}) {
  const works = useMemo(
    () => libraryCollection(songs, projects, search),
    [songs, projects, search],
  );
  if (!works.length)
    return (
      <p className="library-empty">
        {search
          ? 'Không tìm thấy bài phù hợp.'
          : trash
            ? 'Chưa có bản nhạc lưu trữ.'
            : 'Nhập bản nhạc để bắt đầu.'}
      </p>
    );
  return (
    <div className="score-grid" aria-label="Danh sách bản nhạc">
      {works.map((work) => (
        <SongCard key={work.id} work={work} practice={practice} trash={trash} />
      ))}
    </div>
  );
}

function SongCard({
  work,
  practice,
  trash,
}: {
  work: LibraryWork;
  practice: boolean;
  trash: boolean;
}) {
  const preference = 'pianist-library-version:' + work.id;
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem(preference);
    } catch {
      return null;
    }
  });
  const edition =
    work.editions.find(
      (e) => e.id === selected || (!!selected && e.song?.sourceSha256 === selected),
    ) ?? work.editions[0];
  const { song, project } = edition;
  const track = project
    ? projectTrack(project, 'Phiên bản ' + edition.version)
    : bundledTrack(song!);
  const open = (practice = false) =>
    void ws.run(() =>
      project ? ws.openProject(project.id, practice) : ws.openBundledScore(song!, practice),
    );
  return (
    <article className="score-card" data-work-id={work.id}>
      <button
        className="score-cover"
        aria-label={(song ? 'Mở bài có sẵn ' : 'Mở ') + work.title}
        onClick={() => open(practice)}
      >
        <ScoreThumbnail
          track={track}
          url={song && !project ? 'library/previews/' + song.id + '.webp' : undefined}
        />
      </button>
      <div className="score-card-body">
        <div className="score-card-heading">
          <h3 title={work.title}>{work.title}</h3>
          {work.editions.length > 1 && (
            <label className="version-chip">
              <span aria-hidden="true">
                V{edition.version} <span className="version-chevron">▾</span>
              </span>
              <select
                aria-label={'Chọn phiên bản ' + work.title}
                value={edition.id}
                onChange={(e) => {
                  if (ws.libraryPlayer.activitySnapshot().id === track.id) ws.libraryPlayer.stop();
                  setSelected(e.target.value);
                  try {
                    localStorage.setItem(preference, e.target.value);
                  } catch {}
                }}
              >
                {work.editions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Phiên bản {v.version}
                    {v.label ? ' · ' + v.label : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="score-actions">
          {trash && project ? (
            <button onClick={() => void ws.run(() => ws.archive(project))}>Khôi phục</button>
          ) : (
            <>
              <ListenButton track={track} />
              <button className="primary-light" onClick={() => open(true)}>
                Tập
              </button>
              <button onClick={() => open()}>Sửa</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
