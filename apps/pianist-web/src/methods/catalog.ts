import { validateFile } from '../platform/files';

export interface MethodLesson {
  id: string;
  number: number;
  title: string;
  /** Relative to the published site, including the methods/ prefix. */
  file: string;
  sha256: string;
  bytes: number;
  sourceUrl: string;
  license: string;
  fingeringCount: number;
}
export interface MethodBook {
  id: string;
  title: string;
  composer: string;
  opus: string;
  description: string;
  expectedLessons: number;
  lessons: MethodLesson[];
}
export interface MethodCatalog {
  schemaVersion: 1;
  books: MethodBook[];
}

const idPattern = /^[a-z0-9][a-z0-9-]{0,119}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && !!value.trim() && value.length <= max;
function sourceUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function validateMethodLesson(lesson: MethodLesson, bookId?: string): void {
  if (
    !lesson ||
    typeof lesson.id !== 'string' ||
    !idPattern.test(lesson.id) ||
    !Number.isSafeInteger(lesson.number) ||
    lesson.number < 1 ||
    lesson.number > 10000 ||
    !text(lesson.title, 300) ||
    typeof lesson.file !== 'string' ||
    !/^methods\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.mxl$/.test(lesson.file) ||
    !lesson.file.endsWith('/' + lesson.id + '.mxl') ||
    (bookId !== undefined && lesson.file !== `methods/${bookId}/${lesson.id}.mxl`) ||
    !hashPattern.test(lesson.sha256) ||
    !Number.isSafeInteger(lesson.bytes) ||
    lesson.bytes < 1 ||
    lesson.bytes > 32 * 1024 * 1024 ||
    !sourceUrl(lesson.sourceUrl) ||
    !text(lesson.license, 200) ||
    !Number.isSafeInteger(lesson.fingeringCount) ||
    lesson.fingeringCount < 0
  )
    throw Error('Thông tin bài giáo trình không hợp lệ.');
}

/** Preserve the book's authored numbering, including genuine gaps in partial editions. */
export function parseMethodCatalog(value: unknown): MethodCatalog {
  const catalog = value as MethodCatalog;
  if (
    !catalog ||
    catalog.schemaVersion !== 1 ||
    !Array.isArray(catalog.books) ||
    !catalog.books.length ||
    catalog.books.length > 100
  )
    throw Error('Danh mục giáo trình không hợp lệ.');
  const books = new Set<string>();
  const paths = new Set<string>();
  for (const book of catalog.books) {
    if (
      !book ||
      typeof book.id !== 'string' ||
      !idPattern.test(book.id) ||
      books.has(book.id) ||
      !text(book.title, 200) ||
      !text(book.composer, 200) ||
      typeof book.opus !== 'string' ||
      book.opus.length > 100 ||
      !text(book.description, 2000) ||
      !Number.isSafeInteger(book.expectedLessons) ||
      book.expectedLessons < 1 ||
      book.expectedLessons > 10000 ||
      !Array.isArray(book.lessons) ||
      !book.lessons.length ||
      book.lessons.length > book.expectedLessons
    )
      throw Error('Thông tin giáo trình không hợp lệ.');
    books.add(book.id);
    const ids = new Set<string>(),
      numbers = new Set<number>();
    for (const lesson of book.lessons) {
      validateMethodLesson(lesson, book.id);
      if (
        ids.has(lesson.id) ||
        numbers.has(lesson.number) ||
        paths.has(lesson.file) ||
        lesson.number > book.expectedLessons
      )
        throw Error('Thứ tự hoặc file bài giáo trình bị trùng, không đúng cuốn sách.');
      ids.add(lesson.id);
      numbers.add(lesson.number);
      paths.add(lesson.file);
    }
  }
  return {
    ...catalog,
    books: catalog.books.map((book) => ({
      ...book,
      lessons: [...book.lessons].sort((a, b) => a.number - b.number),
    })),
  };
}

async function boundedRequest<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const abort = new AbortController();
  const cancel = () => abort.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(
    () => abort.abort(new Error('Tải giáo trình quá lâu. Bấm thử lại khi có mạng.')),
    30000,
  );
  try {
    const result = await read(abort.signal);
    abort.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (abort.signal.aborted) throw abort.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function loadMethodCatalog(signal?: AbortSignal): Promise<MethodCatalog> {
  return boundedRequest(async (request) => {
    const response = await fetch('methods/catalog.json', { signal: request });
    if (!response.ok) throw Error('Chưa tải được danh mục giáo trình. Bấm thử lại khi có mạng.');
    return parseMethodCatalog(await response.json());
  }, signal);
}

export async function loadMethodLesson(
  lesson: MethodLesson,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  validateMethodLesson(lesson);
  return boundedRequest(async (request) => {
    const response = await fetch(lesson.file, { signal: request });
    if (!response.ok)
      throw Error('Chưa tải được bài ' + lesson.number + '. Bấm mở lại để thử lại.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== lesson.bytes)
      throw Error('Bài giáo trình tải chưa đủ hoặc sai phiên bản. Hãy tải lại trang rồi thử lại.');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== lesson.sha256)
      throw Error('Bài giáo trình tải chưa đủ hoặc sai phiên bản. Hãy tải lại trang rồi thử lại.');
    await validateFile(bytes, lesson.file, request);
    return bytes;
  }, signal);
}
