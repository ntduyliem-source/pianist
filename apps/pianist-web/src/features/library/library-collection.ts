import { isBundledSource, type BundledScore } from '../../platform/bundled-library';
import { creditSearch } from '../../shared/score-metadata';
import type { ProjectRecord } from '../../platform/storage';
import { matchesSearch } from '../../shared/search';

export interface LibraryEdition {
  id: string;
  version: number;
  label: string;
  song?: BundledScore;
  project?: ProjectRecord;
}
export interface LibraryWork {
  id: string;
  title: string;
  editions: LibraryEdition[];
}

/** One work, one card. A saved local edition replaces its bundled source in the picker. */
export function libraryCollection(songs: BundledScore[], projects: ProjectRecord[], search = '') {
  const works = new Map<string, LibraryWork>();
  for (const song of songs) {
    const id = song.workId ?? song.id;
    const work = works.get(id) ?? { id, title: song.title, editions: [] };
    work.editions.push({
      id: song.id,
      version: song.version ?? 1,
      label: song.versionLabel ?? '',
      song,
    });
    works.set(id, work);
  }
  for (const project of [...projects].sort(
    (a, b) => (a.version ?? 1) - (b.version ?? 1) || a.createdAt - b.createdAt,
  )) {
    const source = project.sourceHash
      ? songs.find((s) => isBundledSource(s, project.sourceHash))
      : undefined;
    const id = source?.workId ?? source?.id ?? project.workId ?? project.id;
    const work = works.get(id) ?? { id, title: project.title, editions: [] };
    const original = work.editions.find(
      (e) =>
        e.song === source &&
        !e.project &&
        (project.version === undefined || e.version === project.version),
    );
    if (source && original) {
      original.project = project;
      original.label = project.title;
    } else {
      const used = new Set(work.editions.map((e) => e.version));
      const version =
        project.version && !used.has(project.version) ? project.version : Math.max(0, ...used) + 1;
      work.editions.push({
        id: project.id,
        version,
        label: project.title,
        project,
      });
    }
    works.set(id, work);
  }
  return [...works.values()]
    .filter((w) =>
      matchesSearch(
        [
          w.title,
          ...w.editions.flatMap((e) => [e.label, creditSearch(e.song), creditSearch(e.project)]),
        ].join(' '),
        search,
      ),
    )
    .map((w) => ({ ...w, editions: w.editions.sort((a, b) => a.version - b.version) }));
}
