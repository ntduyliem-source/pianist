import type { ProjectRecord, RecoveryRecord } from './storage';

/** The same revision can have a newer recovery (for example, a legacy metadata write).
 * All consumers must choose bytes, title, filename and revision as one document. */
export function latestProjectDocument(
  project: ProjectRecord,
  recovery?: RecoveryRecord,
): ProjectRecord {
  if (
    !recovery ||
    recovery.id !== project.id ||
    recovery.revision < project.revision ||
    (recovery.revision === project.revision && recovery.updatedAt <= project.updatedAt)
  )
    return project;
  return {
    ...project,
    bytes: recovery.bytes,
    title: recovery.title,
    filename: recovery.filename,
    revision: recovery.revision,
    updatedAt: recovery.updatedAt,
  };
}
