import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import {
  loadMethodCatalog,
  loadMethodLesson,
  parseMethodCatalog,
  type MethodBook,
  type MethodCatalog,
  type MethodLesson,
} from '../src/methods/catalog';
import {
  adjacentMethodLesson,
  methodMatches,
  rememberedMethodLesson,
  rememberMethodSelection,
  resolveMethodSelection,
  METHOD_SELECTION_KEY,
} from '../src/methods/selection';

const lesson = (number: number, book = 'hanon'): MethodLesson => ({
  id: `lesson-${number}`,
  number,
  title: `Étude ${number}`,
  file: `methods/${book}/lesson-${number}.mxl`,
  bytes: 100,
  sha256: 'a'.repeat(64),
  sourceUrl: 'https://example.org/public-score',
  license: 'CC0-1.0',
  fingeringCount: 0,
});
const book = (id = 'hanon'): MethodBook => ({
  id,
  title: 'Hanon',
  composer: 'Charles-Louis Hanon',
  opus: 'Op.60',
  description: 'Bản gốc hai khuông.',
  expectedLessons: 20,
  lessons: [lesson(1, id), lesson(3, id), lesson(10, id)],
});
const catalog = (): MethodCatalog => ({ schemaVersion: 1, books: [book(), book('czerny')] });

test('method catalog preserves authored numbers and gaps, sorts without renumbering', () => {
  const input = catalog();
  input.books[0].lessons.reverse();
  const result = parseMethodCatalog(input);
  assert.deepEqual(
    result.books[0].lessons.map((l) => l.number),
    [1, 3, 10],
  );
  assert.equal(input.books[0].lessons[0].number, 10);
  assert.equal(result.books[0].expectedLessons, 20);
  assert.equal(adjacentMethodLesson(result.books[0], result.books[0].lessons[0], 1)?.number, 3);
  assert.equal(adjacentMethodLesson(result.books[0], result.books[0].lessons[0], -1), undefined);
  assert.equal(adjacentMethodLesson(result.books[0], result.books[0].lessons[2], 1), undefined);
});

test('method manifest binds lesson ids to their book and rejects remote/traversal assets', () => {
  for (const file of [
    'https://elsewhere.test/lesson-1.mxl',
    'methods/hanon/../lesson-1.mxl',
    'methods/hanon/lesson-2.mxl',
    'methods/czerny/lesson-1.mxl',
    '/methods/hanon/lesson-1.mxl',
    'methods/hanon/lesson-1.xml',
  ]) {
    const input = catalog();
    input.books[0].lessons[0].file = file;
    assert.throws(() => parseMethodCatalog(input));
  }
  const unsafeSource = catalog();
  unsafeSource.books[0].lessons[0].sourceUrl = 'javascript:alert(1)';
  assert.throws(() => parseMethodCatalog(unsafeSource));
});

test('method manifest rejects duplicate books/numbers and malformed content', () => {
  const duplicateBook = catalog();
  duplicateBook.books.push(duplicateBook.books[0]);
  assert.throws(() => parseMethodCatalog(duplicateBook));
  const duplicateNumber = catalog();
  duplicateNumber.books[0].lessons[1].number = 1;
  assert.throws(() => parseMethodCatalog(duplicateNumber));
  const empty = catalog();
  empty.books[0].lessons = [];
  assert.throws(() => parseMethodCatalog(empty));
  for (const patch of [
    { sha256: 'invalid' },
    { bytes: 0 },
    { number: 21 },
    { fingeringCount: -1 },
  ]) {
    const input = catalog();
    Object.assign(input.books[0].lessons[0], patch);
    assert.throws(() => parseMethodCatalog(input));
  }
});

test('method lookup searches accents-insensitively and resumes each book independently', (t) => {
  const memory = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  t.after(() =>
    previous
      ? Object.defineProperty(globalThis, 'localStorage', previous)
      : delete (globalThis as any).localStorage,
  );
  const c = catalog(),
    first = c.books[0],
    second = c.books[1];
  first.lessons[1].title = 'Đường về';
  assert.equal(methodMatches(first.lessons[1], 'duong ve'), true);
  assert.equal(methodMatches(first.lessons[1], 'bai 03'), true);
  rememberMethodSelection(first, first.lessons[1]);
  rememberMethodSelection(second, second.lessons[2]);
  assert.equal(resolveMethodSelection(c).book.id, 'czerny');
  assert.equal(resolveMethodSelection(c).lesson.number, 10);
  assert.equal(rememberedMethodLesson(first).number, 3);
  assert.equal(
    resolveMethodSelection(c, { bookId: 'hanon', lessonId: 'lesson-1' }).lesson.number,
    1,
  );
  memory.set(METHOD_SELECTION_KEY, '{invalid json');
  assert.equal(resolveMethodSelection(c).lesson.number, 1);
  memory.set(METHOD_SELECTION_KEY, JSON.stringify({ bookId: 'deleted-book', lessons: {} }));
  assert.equal(resolveMethodSelection(c).book.id, 'hanon');
});

async function zippedLesson() {
  const bytes = zipSync({
    'META-INF/container.xml': strToU8(
      '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
    ),
    'score.xml': strToU8(
      '<score-partwise><part-list/><part id="P1"><measure number="1"><attributes><staves>2</staves></attributes></measure></part></score-partwise>',
    ),
  });
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { bytes, entry: { ...lesson(1), bytes: bytes.length, sha256 } };
}

test('method lesson checks downloaded bytes/hash before native rendering', async (t) => {
  const { bytes, entry } = await zippedLesson();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    requests++;
    assert.equal(path, entry.file);
    return new Response(bytes.slice().buffer);
  });
  assert.deepEqual(await loadMethodLesson(entry), bytes);
  await assert.rejects(loadMethodLesson({ ...entry, sha256: 'b'.repeat(64) }), /sai phiên bản/);
  assert.equal(requests, 2);
});

test('method catalogue and lesson failures can be retried without caching rejected promises', async (t) => {
  let fail = true;
  const { bytes, entry } = await zippedLesson();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (fail) return new Response(null, { status: 503 });
    return path.endsWith('catalog.json')
      ? Response.json(catalog())
      : new Response(bytes.slice().buffer);
  });
  await assert.rejects(loadMethodCatalog(), /Chưa tải được/);
  await assert.rejects(loadMethodLesson(entry), /Chưa tải được/);
  fail = false;
  assert.equal((await loadMethodCatalog()).books.length, 2);
  assert.deepEqual(await loadMethodLesson(entry), bytes);
});

test('method download forwards cancellation, including an already-cancelled request', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', (_path: string, init: RequestInit) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    });
  });
  const cancel = new AbortController();
  const pending = loadMethodLesson(lesson(1), cancel.signal);
  cancel.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(loadMethodCatalog(cancel.signal), { name: 'AbortError' });
  assert.equal(requests, 1);
});

test('method network deadline returns a retryable error instead of endless loading', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(
    globalThis,
    'fetch',
    (_path: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      }),
  );
  const pending = loadMethodCatalog();
  t.mock.timers.tick(30001);
  await assert.rejects(pending, /quá lâu/);
});
