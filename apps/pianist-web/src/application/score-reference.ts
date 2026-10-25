/** Persisted IDs predate the three practice modes. Decode them at the boundary
 * without migrating or renaming existing IndexedDB projects. */
export type ScoreRef =
  | { kind: 'project'; projectId: string }
  | { kind: 'grade'; exerciseId: string }
  | { kind: 'method'; bookId: string; lessonId: string };

export function scoreReference(projectId: string): ScoreRef {
  const method = /^method:([a-z0-9-]+):([a-z0-9-]+)$/.exec(projectId);
  if (method) return { kind: 'method', bookId: method[1], lessonId: method[2] };
  const grade = /^grade:([a-f0-9]{64})$/.exec(projectId);
  if (grade) return { kind: 'grade', exerciseId: grade[1] };
  return { kind: 'project', projectId };
}
