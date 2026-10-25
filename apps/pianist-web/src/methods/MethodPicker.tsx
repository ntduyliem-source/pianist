import { useEffect, useState } from 'react';
import { Icon } from '../shared/ui/Icon';
import type { MethodBook, MethodCatalog, MethodLesson } from './catalog';
import {
  adjacentMethodLesson,
  methodLessonLabel,
  methodMatches,
  rememberedMethodLesson,
  rememberMethodSelection,
  resolveMethodSelection,
  type MethodSelection,
} from './selection';
import '../styles/methods.css';

export function MethodPicker({
  catalog,
  onStart,
  busy = false,
  initialSelection,
}: {
  catalog: MethodCatalog;
  onStart: (book: MethodBook, lesson: MethodLesson) => void | Promise<void>;
  busy?: boolean;
  initialSelection?: MethodSelection;
}) {
  const [selected, setSelected] = useState(() => resolveMethodSelection(catalog, initialSelection));
  const [search, setSearch] = useState('');
  const { book, lesson } = selected;
  const rows = book.lessons.filter((entry) => methodMatches(entry, search));
  useEffect(() => {
    setSelected(resolveMethodSelection(catalog, initialSelection));
    setSearch('');
  }, [catalog, initialSelection?.bookId, initialSelection?.lessonId]);
  const select = (nextBook: MethodBook, nextLesson: MethodLesson) => {
    setSelected({ book: nextBook, lesson: nextLesson });
    rememberMethodSelection(nextBook, nextLesson);
  };
  return (
    <section className="method-picker" aria-label="Chọn giáo trình và bài">
      <div className="method-book-field">
        <label htmlFor="method-book">Giáo trình</label>
        <select
          id="method-book"
          value={book.id}
          disabled={busy}
          onChange={(event) => {
            const nextBook = catalog.books.find((b) => b.id === event.target.value)!;
            select(nextBook, rememberedMethodLesson(nextBook));
            setSearch('');
          }}
        >
          {catalog.books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <p className="method-book-description">{book.description}</p>
        <span className="method-availability" data-testid="method-availability">
          {book.lessons.length === book.expectedLessons
            ? `Đủ ${book.lessons.length} bài`
            : `Hiện có ${book.lessons.length}/${book.expectedLessons} bài`}
        </span>
      </div>
      <div className="method-lessons-field">
        <div className="method-lesson-heading">
          <label htmlFor="method-lesson">Bài tập</label>
          <label className="method-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Tìm bài trong giáo trình"
              placeholder="Tên hoặc số bài…"
              value={search}
              disabled={busy}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <select
          id="method-lesson"
          value={rows.some((l) => l.id === lesson.id) ? lesson.id : ''}
          disabled={busy || !rows.length}
          onChange={(event) => {
            const entry = book.lessons.find((l) => l.id === event.target.value);
            if (entry) select(book, entry);
          }}
        >
          {!rows.some((l) => l.id === lesson.id) && (
            <option value="" disabled>
              {rows.length ? 'Chọn kết quả tìm kiếm' : 'Không tìm thấy bài'}
            </option>
          )}
          {rows.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {methodLessonLabel(entry)}
            </option>
          ))}
        </select>
        <div className="method-launch">
          <span className="method-selection-label" data-testid="method-selected-lesson">
            {methodLessonLabel(lesson)}
          </span>
          <button
            className="primary"
            aria-label="Mở bài giáo trình"
            disabled={busy || !rows.some((l) => l.id === lesson.id)}
            onClick={() => void onStart(book, lesson)}
          >
            <Icon name="score" /> Mở bài
          </button>
        </div>
        <p className="method-picker-help">Chọn tay và chế độ Đúng nốt / BPM ngay trên màn tập.</p>
      </div>
    </section>
  );
}

export function MethodLessonNav({
  book,
  lesson,
  disabled,
  onSelect,
}: {
  book: MethodBook;
  lesson: MethodLesson;
  disabled?: boolean;
  onSelect: (lesson: MethodLesson) => void;
}) {
  const previous = adjacentMethodLesson(book, lesson, -1);
  const next = adjacentMethodLesson(book, lesson, 1);
  return (
    <div
      className="method-lesson-nav"
      data-testid="method-progress"
      data-book-id={book.id}
      data-lesson-id={lesson.id}
    >
      <strong title={book.title}>{book.title}</strong>
      <select
        aria-label="Bài trong giáo trình đang tập"
        value={lesson.id}
        disabled={disabled}
        onChange={(event) => onSelect(book.lessons.find((l) => l.id === event.target.value)!)}
      >
        {book.lessons.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {methodLessonLabel(entry)}
          </option>
        ))}
      </select>
      <div className="method-next-buttons">
        <button
          aria-label="Bài giáo trình trước"
          title="Bài trước"
          disabled={disabled || !previous}
          onClick={() => previous && onSelect(previous)}
        >
          <Icon name="back" />
        </button>
        <button
          aria-label="Bài giáo trình tiếp theo"
          title="Bài tiếp"
          disabled={disabled || !next}
          onClick={() => next && onSelect(next)}
        >
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}
