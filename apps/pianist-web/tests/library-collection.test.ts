import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryCollection } from '../src/features/library/library-collection';
import type { BundledScore } from '../src/platform/bundled-library';
import type { ProjectRecord } from '../src/platform/storage';

const hash = 'a'.repeat(64), originalHash = 'b'.repeat(64);
const song: BundledScore = { id: hash, sha256: hash, sourceSha256: originalHash,
  workId: originalHash, version: 1, title: 'Ánh trăng', filename: 'moon.mxl',
  url: 'library/songs/moon.mxl', bytes: 10 };
const project = (extra: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'local', title: 'Bài riêng', filename: 'local.mscz', bytes: new Uint8Array(2),
  revision: 1, createdAt: 1, updatedAt: 1, ...extra,
});

test('an unrelated local score without source metadata never becomes a bundled edition', () => {
  const works = libraryCollection([song], [project()]);
  assert.equal(works.length, 2);
  assert.equal(works[0].editions[0].project, undefined);
  assert.equal(works[1].id, 'local');
});

test('a saved source stays one edition before and after font-only normalization', () => {
  for (const sourceHash of [hash, originalHash]) {
    const saved = project({ sourceHash, title: 'Tên đã sửa' });
    const works = libraryCollection([song], [saved], 'ten da sua');
    assert.equal(works.length, 1);
    assert.equal(works[0].editions.length, 1);
    assert.equal(works[0].editions[0].project, saved);
    assert.equal(works[0].id, originalHash);
  }
});

test('Save As remains separate from its bundled source regardless of storage order', () => {
  const saved = project({ sourceHash: hash, version: 1 });
  const copy = project({ id: 'copy', sourceHash: hash, version: 2, title: 'Bản khác' });
  const works = libraryCollection([song], [copy, saved], 'ban khac');
  assert.equal(works.length, 1);
  assert.deepEqual(works[0].editions.map(e => [e.version, e.project?.id]), [[1, 'local'], [2, 'copy']]);
});

test('retiring version one keeps version two; unrelated same-title works stay separate', () => {
  const second = { ...song, version: 2 };
  const works = libraryCollection([second], [project({ title: song.title })], 'anh trang');
  assert.equal(works.length, 2);
  assert.equal(works[0].editions[0].version, 2);
});
