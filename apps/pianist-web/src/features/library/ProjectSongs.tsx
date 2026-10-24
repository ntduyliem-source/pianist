import { useMemo, useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { groupProjects, type ProjectWork } from './project-versions';
import { matchesSearch } from '../../shared/search';
import { Icon } from '../../shared/ui/Icon';
import { ScoreMenu } from './ScoreMenu';
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
        work.versions.some((p) => matchesSearch(p.title, search)),
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
  const [groupId, setGroupId] = useState('');
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
        <ScoreMenu
          title={work.title}
          version={version}
          filename={project.sourceName ?? project.filename}
          onEdit={trash ? undefined : () => void ws.run(() => ws.openProject(project.id))}
        >
          {(close) =>
            !trash && (
              <>
                <button
                  onClick={() =>
                    void ws.run(async () => {
                      await ws.archive(project);
                      close();
                    })
                  }
                >
                  Chuyển vào lưu trữ
                </button>
                <p className="score-menu-help">
                  Ẩn phiên bản này khỏi thư viện. Có thể khôi phục trong “Đã lưu trữ”.
                </p>
                {groups.some((g) => g.id !== work.id) && (
                  <details className="score-version-tools">
                    <summary>Chuyển sang nhóm bài khác…</summary>
                    <p>
                      Dùng khi đây là một bản phối khác của bài đã có. Chỉ chuyển phiên bản đang
                      chọn.
                    </p>
                    <label>
                      Bài nhận phiên bản
                      <select
                        aria-label="Bài nhận phiên bản"
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                      >
                        <option value="">Chọn bài…</option>
                        {groups
                          .filter((g) => g.id !== work.id)
                          .map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      disabled={!groups.some((g) => g.id === groupId && g.id !== work.id)}
                      onClick={() =>
                        void ws.run(async () => {
                          await ws.groupProjectVersion(project, groupId);
                          close();
                        })
                      }
                    >
                      Chuyển phiên bản
                    </button>
                  </details>
                )}
              </>
            )
          }
        </ScoreMenu>
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
        <div className="score-actions">
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
                <Icon name="play" /> Tập
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
