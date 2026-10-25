import { matchesSearch } from '../shared/search';
import type { MethodBook, MethodCatalog, MethodLesson } from './catalog';

export interface MethodSelection {
  bookId: string;
  lessonId: string;
}
type Memory = { bookId?: string; lessons: Record<string, string> };
export const METHOD_SELECTION_KEY = 'pianist.methods.selection.v1';

function readMemory(): Memory {
  try {
    const saved = JSON.parse(localStorage.getItem(METHOD_SELECTION_KEY) ?? '{}');
    return {
      bookId: typeof saved.bookId === 'string' ? saved.bookId : undefined,
      lessons: Object.fromEntries(
        Object.entries(saved.lessons ?? {}).filter(
          ([book, lesson]) => /^[a-z0-9-]+$/.test(book) && typeof lesson === 'string',
        ),
      ) as Record<string, string>,
    };
  } catch {
    return { lessons: {} };
  }
}
export function resolveMethodSelection(
  catalog: MethodCatalog,
  initial?: MethodSelection,
): { book: MethodBook; lesson: MethodLesson } {
  const saved = readMemory();
  const book =
    catalog.books.find((b) => b.id === (initial?.bookId ?? saved.bookId)) ?? catalog.books[0];
  const lesson =
    book.lessons.find((l) => l.id === (initial?.lessonId ?? saved.lessons[book.id])) ??
    book.lessons[0];
  return { book, lesson };
}
export function rememberedMethodLesson(book: MethodBook): MethodLesson {
  return (
    book.lessons.find((lesson) => lesson.id === readMemory().lessons[book.id]) ?? book.lessons[0]
  );
}
export function rememberMethodSelection(book: MethodBook, lesson: MethodLesson): void {
  if (!book.lessons.some((l) => l.id === lesson.id)) return;
  const memory = readMemory();
  try {
    localStorage.setItem(
      METHOD_SELECTION_KEY,
      JSON.stringify({ bookId: book.id, lessons: { ...memory.lessons, [book.id]: lesson.id } }),
    );
  } catch {
    // Private browsing/storage limits must not prevent opening a score.
  }
}
export function methodLessonLabel(lesson: MethodLesson): string {
  const number = `Bài ${String(lesson.number).padStart(2, '0')}`;
  return /^(?:Bài|Exercise|Etude|Étude|Study|No\.?)\s*\d+$/i.test(lesson.title)
    ? number
    : `${number} · ${lesson.title}`;
}
export function methodMatches(lesson: MethodLesson, query: string): boolean {
  return matchesSearch(methodLessonLabel(lesson), query);
}
export function adjacentMethodLesson(
  book: MethodBook,
  current: MethodLesson,
  direction: -1 | 1,
): MethodLesson | undefined {
  const at = book.lessons.findIndex((lesson) => lesson.id === current.id);
  return at < 0 ? undefined : book.lessons[at + direction];
}
