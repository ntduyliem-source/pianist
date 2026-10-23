import type { ProjectRecord } from '../../platform/storage';
import type { BundledScore } from '../../platform/bundled-library';
export interface ProjectWork {
  id: string;
  title: string;
  versions: ProjectRecord[];
}
export function projectWorkId(
  project: ProjectRecord,
  scores: readonly BundledScore[] = [],
): string {
  if (project.workId) return project.workId;
  const source = project.source;
  const edition =
    source &&
    scores.find(
      (song) =>
        song.filename === project.sourceName &&
        song.bytes === source.length &&
        song.sha256 === project.sourceHash,
    );
  return edition ? (edition.workId ?? edition.id) : project.id;
}
export function groupProjects(
  projects: readonly ProjectRecord[],
  scores: readonly BundledScore[] = [],
): ProjectWork[] {
  const groups = new Map<string, ProjectWork>();
  for (const project of [...projects].sort(
    (a, b) =>
      (a.version ?? 1) - (b.version ?? 1) || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )) {
    const id = projectWorkId(project, scores),
      work = groups.get(id) ?? { id, title: project.title, versions: [] };
    work.versions.push(project);
    groups.set(id, work);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Math.max(...b.versions.map((p) => p.updatedAt)) -
      Math.max(...a.versions.map((p) => p.updatedAt)),
  );
}
