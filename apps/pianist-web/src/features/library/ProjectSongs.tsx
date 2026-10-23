import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { groupProjects, type ProjectWork } from './project-versions';
import { projectDate } from './presentation';
import { projectTrack, ListenButton } from './LibraryPlayback';
import { ScoreThumbnail } from './ScoreThumbnail';
import type { ProjectRecord } from '../../platform/storage';

export function ProjectSongs({
  projects,
  practice = false,
  trash = false,
  search = '',
}: {
  projects: ProjectRecord[];
  practice?: boolean;
  trash?: boolean;
  search?: string;
}) {
  const groups = useMemo(
    () =>
      groupProjects(projects).filter((work) =>
        work.versions.some((p) =>
          p.title.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
        ),
      ),
    [projects, search],
  );
  return (
    <div className="score-grid">
      {groups.map((work) => (
        <ProjectCard key={work.id} work={work} practice={practice} trash={trash} />
      ))}
    </div>
  );
}
function ProjectCard({
  work,
  practice,
  trash,
}: {
  work: ProjectWork;
  practice: boolean;
  trash: boolean;
}) {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  const preference = 'pianist-project-version:' + work.id;
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(preference);
    } catch {
      return null;
    }
  });
  const details = useRef<HTMLDialogElement>(null);
  const project = work.versions.find((p) => p.id === id) ?? work.versions[0];
  const version = 'Phiên bản ' + (project.version ?? work.versions.indexOf(project) + 1),
    track = projectTrack(project, version);
  const groups = useMemo(
    () => groupProjects(state.projects.filter((p) => !p.archived)),
    [state.projects],
  );
  const choose = (next: string) => {
    if (ws.libraryPlayer.activitySnapshot().id.startsWith('project:' + project.id + ':'))
      ws.libraryPlayer.stop();
    setId(next);
    try {
      localStorage.setItem(preference, next);
    } catch {}
  };
  return (
    <article className="score-card" data-work-id={work.id}>
      <button
        className="score-cover"
        aria-label={(practice ? 'Tập ' : 'Mở ') + work.title}
        onClick={() => void ws.run(() => ws.openProject(project.id, practice))}
      >
        <ScoreThumbnail track={track} />
      </button>
      <div className="score-card-body">
        <h3>{work.title}</h3>
        {work.versions.length > 1 && (
          <label className="bundled-version">
            <span>{work.versions.length} phiên bản</span>
            <select
              aria-label={'Chọn phiên bản ' + work.title}
              value={project.id}
              onChange={(e) => choose(e.target.value)}
            >
              {work.versions.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Phiên bản {p.version ?? i + 1} · {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="button-row">
          {trash ? (
            <button onClick={() => void ws.run(() => ws.archive(project))}>Khôi phục</button>
          ) : (
            <>
              <ListenButton track={track} />
              <button
                className="primary-light"
                aria-label={practice ? 'Bắt đầu với ' + project.title : undefined}
                onClick={() => void ws.run(() => ws.openProject(project.id, true))}
              >
                Tập
              </button>
              <button onClick={() => void ws.run(() => ws.openProject(project.id))}>
                Chỉnh sửa
              </button>
            </>
          )}
          <button
            aria-label={'Chi tiết ' + work.title}
            title="Chi tiết và phiên bản"
            onClick={() => details.current?.showModal()}
          >
            ⋯
          </button>
        </div>
      </div>
      <dialog ref={details} className="score-info" aria-label={'Chi tiết ' + work.title}>
        <div className="dialog-heading">
          <h2>{project.title}</h2>
          <button aria-label="Đóng chi tiết" onClick={() => details.current?.close()}>
            ×
          </button>
        </div>
        <p>
          {version} · {projectDate(project.updatedAt)} · {Math.round(project.bytes.length / 1024)}{' '}
          KB
        </p>
        <p>Nguồn: {project.sourceName ?? project.filename}</p>
        {!trash && (
          <label>
            Gộp thành phiên bản của bài
            <select
              aria-label="Gộp vào nhóm phiên bản"
              value={work.id}
              onChange={(e) =>
                void ws.run(async () => {
                  await ws.groupProjectVersion(project, e.target.value);
                  details.current?.close();
                })
              }
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!trash && (
          <button
            className="archive"
            aria-label={'Lưu trữ ' + project.title}
            onClick={() =>
              void ws.run(async () => {
                await ws.archive(project);
                details.current?.close();
              })
            }
          >
            Lưu trữ phiên bản này
          </button>
        )}
      </dialog>
    </article>
  );
}
