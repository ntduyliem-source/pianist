import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ExerciseRenderer } from '../../../../packages/exercise-renderer';
import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import type { AttemptResult, PracticeSettings } from '../../../../packages/practice-engine-v2';
import { PracticeRepository } from '../application/practice-repository';
import { Practice } from '../practice/PracticeScreen';
import type { PracticeController } from '../practice/controller-v2';
import { workspace as ws } from '../workspace';
import {
  loadMethodCatalog,
  loadMethodLesson,
  type MethodBook,
  type MethodCatalog,
  type MethodLesson,
} from './catalog';
import { MethodLessonNav, MethodPicker } from './MethodPicker';
import { methodLessonLabel, rememberMethodSelection, type MethodSelection } from './selection';
import '../styles/methods.css';

interface Ready {
  book: MethodBook;
  lesson: MethodLesson;
  bytes: Uint8Array;
  snapshot: ScoreSnapshot;
}
interface Run {
  abort: AbortController;
  renderer: ExerciseRenderer;
  session?: PracticeController;
  current?: Ready;
  moving: boolean;
  attempt: number;
  saving?: Promise<void>;
  lastResultId?: string;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const repository = new PracticeRepository();

/** A book chooses an original score. Rendering, playback and grading remain shared with Practice. */
export function Methods() {
  useSyncExternalStore(ws.subscribe, ws.snapshot);
  const sessionStatus = useSyncExternalStore(
    ws.sessions.subscribeStatus,
    ws.sessions.statusSnapshot,
  );
  const [catalog, setCatalog] = useState<MethodCatalog>();
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [ready, setReady] = useState<Ready>();
  const [config, setConfig] = useState<PracticeSettings>();
  const [busy, setBusy] = useState('Đang tải giáo trình…');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [selection, setSelection] = useState<MethodSelection>();
  const run = useRef<Run | undefined>(undefined);
  const alive = useRef(true);
  const configRef = useRef<PracticeSettings | undefined>(undefined);
  const auditionAbort = useRef<AbortController | undefined>(undefined);
  const lastRequest = useRef<
    | {
        book: MethodBook;
        lesson: MethodLesson;
        settings?: Partial<PracticeSettings>;
      }
    | undefined
  >(undefined);

  const ensureCurrent = (r: Run) => {
    r.abort.signal.throwIfAborted();
    if (!alive.current || run.current !== r)
      throw new DOMException('Đã rời bài giáo trình.', 'AbortError');
  };
  const stopRun = () => {
    auditionAbort.current?.abort();
    auditionAbort.current = undefined;
    const r = run.current;
    run.current = undefined;
    r?.abort.abort();
    r?.renderer.dispose();
    ws.sessions.dispose(r?.session);
    if (r) ws.midi.release();
  };
  const selectorView = () => {
    stopRun();
    setReady(undefined);
    setConfig(undefined);
    configRef.current = undefined;
    setBusy('');
    setError('');
    setSummary('');
    ws.restoreExerciseEditor();
    ws.patch({ practicePicker: true });
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopRun();
    };
  }, []);
  useEffect(() => {
    if (ws.state.practicePicker && run.current) selectorView();
  }, [ws.state.practicePicker]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy('Đang tải giáo trình…');
    setError('');
    void loadMethodCatalog(abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) setCatalog(next);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy('');
      });
    return () => abort.abort();
  }, [catalogVersion]);

  useEffect(() => {
    const r = run.current,
      item = r?.current,
      current = configRef.current;
    const deviceId = ws.midi.deviceId;
    if (!r || !item || !current || current.deviceId === deviceId || ws.sessions.active) return;
    const changed = repository.updateSettings(item.snapshot, current, {}, deviceId);
    configRef.current = changed;
    setConfig(changed);
    void repository
      .loadSettings(item.snapshot, deviceId, {
        projectId: item.snapshot.projectId,
        config: changed,
      })
      .then((calibrated) => {
        if (
          !alive.current ||
          run.current !== r ||
          r.current !== item ||
          ws.midi.deviceId !== deviceId ||
          ws.sessions.active
        )
          return;
        const latest = configRef.current;
        if (!latest || latest.deviceId !== deviceId) return;
        const next = { ...latest, offsetMs: calibrated.offsetMs };
        configRef.current = next;
        setConfig(next);
      })
      .catch((e) => {
        if (alive.current && run.current === r) setError(message(e));
      });
  }, [ws.midi.deviceId, sessionStatus, config?.deviceId]);

  const finishAttempt = async (r: Run) => {
    const session = r.session;
    if (session && !['ready', 'finished'].includes(session.status)) {
      await session.finish();
      ensureCurrent(r);
      if (session.status !== 'finished')
        throw Error(session.message || 'Chưa kết thúc được lượt tập.');
    }
    await r.saving;
    ensureCurrent(r);
  };
  const open = async (
    book: MethodBook,
    lesson: MethodLesson,
    requestedSettings?: Partial<PracticeSettings>,
  ) => {
    if (run.current?.moving || ws.sessions.active) return;
    lastRequest.current = { book, lesson, settings: requestedSettings };
    setSelection({ bookId: book.id, lessonId: lesson.id });
    let r = run.current;
    if (!r) {
      r = {
        abort: new AbortController(),
        renderer: new ExerciseRenderer(),
        moving: false,
        attempt: 0,
      };
      run.current = r;
    }
    const currentRun = r;
    r.moving = true;
    setBusy('Đang mở bài giáo trình…');
    setError('');
    try {
      await finishAttempt(r);
      auditionAbort.current?.abort();
      ws.sessions.dispose(r.session);
      r.session = undefined;
      r.current = undefined;
      ws.midi.release();
      setReady(undefined);
      setConfig(undefined);
      setSummary('');
      // Unmount Practice before fetching the next score so its preview stops immediately.
      ws.patch({ practicePicker: false });
      const bytes = await loadMethodLesson(lesson, r.abort.signal);
      ensureCurrent(r);
      const rendered = await r.renderer.prepare(bytes, lesson.id + '.mxl', r.abort.signal);
      ensureCurrent(r);
      if (rendered.sourceHash !== lesson.sha256) throw Error('Renderer nhận sai bài giáo trình.');
      if (rendered.snapshot.staves.length !== 2)
        throw Error('Bản giáo trình phải giữ đủ hai khuông.');
      const snapshot: ScoreSnapshot = {
        ...rendered.snapshot,
        title: `${book.title} · ${methodLessonLabel(lesson)}`,
        projectId: `method:${book.id}:${lesson.id}`,
        fingerprint: lesson.sha256,
      };
      const prior = configRef.current;
      // Preferences travel to the next lesson; range, voices and staff roles belong to each score.
      const overrides: Partial<PracticeSettings> | undefined = prior
        ? {
            mode: prior.mode,
            bpm: prior.bpm,
            tempoMode: prior.tempoMode,
            hand: prior.hand,
            countIn: prior.countIn,
            metronome: prior.metronome,
            accompaniment: prior.accompaniment,
            difficulty: prior.difficulty,
            durationEnabled: prior.durationEnabled,
            pedalEnabled: prior.pedalEnabled,
          }
        : undefined;
      let nextConfig = await repository.loadSettings(
        snapshot,
        ws.midi.deviceId,
        undefined,
        overrides,
      );
      ensureCurrent(r);
      if (requestedSettings)
        nextConfig = repository.updateSettings(
          snapshot,
          nextConfig,
          requestedSettings,
          ws.midi.deviceId,
        );
      const item = { book, lesson, bytes, snapshot };
      r.current = item;
      r.lastResultId = undefined;
      setReady(item);
      configRef.current = nextConfig;
      setConfig(nextConfig);
      rememberMethodSelection(book, lesson);
    } catch (e) {
      if (run.current === currentRun && !currentRun.abort.signal.aborted) setError(message(e));
    } finally {
      currentRun.moving = false;
      if (alive.current && run.current === currentRun) setBusy('');
    }
  };
  const back = async () => {
    const r = run.current;
    if (r) await finishAttempt(r);
    selectorView();
  };
  const complete = (result: AttemptResult): Promise<void> => {
    const r = run.current,
      item = r?.current;
    if (!r || !item || result.projectId !== item.snapshot.projectId || r.lastResultId === result.id)
      return Promise.resolve();
    r.lastResultId = result.id;
    const attempt = r.attempt;
    const saving = ws.recordResult(result, true, false).then(() => {
      if (!alive.current || run.current !== r || r.current !== item || r.attempt !== attempt)
        return;
      const outcome =
        result.outcome === 'complete'
          ? 'Hoàn tất'
          : result.outcome === 'aborted'
            ? 'Đã dừng'
            : 'Gián đoạn';
      setSummary(
        `${outcome} · ${result.metrics.hits}/${result.metrics.planned} nốt · ${result.metrics.misses} bỏ lỡ · ${result.metrics.extras} thừa${result.settings.mode === 'bpm' && result.metrics.accuracy !== null ? ` · ${(result.metrics.accuracy * 100).toFixed(1)}%` : ''}${result.simulation ? ' · Mô phỏng' : ''}`,
      );
    });
    r.saving = saving;
    return saving;
  };
  const updateSettings = (patch: Partial<PracticeSettings>) => {
    const r = run.current,
      item = r?.current,
      current = configRef.current;
    if (!r || !item || !current || ws.sessions.active) return;
    const next = repository.updateSettings(item.snapshot, current, patch, ws.midi.deviceId);
    configRef.current = next;
    setConfig(next);
    void repository.saveSettings(item.snapshot.projectId, next, patch).catch((e) => {
      if (alive.current && run.current === r && r.current === item) setError(message(e));
    });
  };

  useEffect(() => {
    const request = ws.state.methodRequest;
    if (!catalog || !request) return;
    if (ws.sessions.active) {
      ws.patch({ methodRequest: undefined });
      setError('Dừng lượt tập hiện tại trước khi mở bài từ lịch sử.');
      return;
    }
    const book = catalog.books.find((entry) => entry.id === request.bookId);
    const lesson = book?.lessons.find((entry) => entry.id === request.lessonId);
    // A newly requested lesson owns its own renderer/cancellation scope. A late
    // response from the previous request can never replace it.
    stopRun();
    setReady(undefined);
    setConfig(undefined);
    configRef.current = undefined;
    ws.patch({ methodRequest: undefined });
    if (!book || !lesson) {
      setBusy('');
      setError(
        'Bài trong lịch sử không còn trong danh mục giáo trình hiện tại. Chọn một bài khác.',
      );
      ws.patch({ practicePicker: true });
      return;
    }
    void open(book, lesson, request.settings);
  }, [catalog, ws.state.methodRequest?.requestId]);

  if (ready && config && run.current) {
    const r = run.current;
    return (
      <Practice
        key={ready.snapshot.projectId}
        snapshot={ready.snapshot}
        config={config}
        exercise={{
          kind: 'method',
          autoStart: 0,
          backLabel: 'Chọn giáo trình và bài',
          loading: !!busy,
          error,
          onSettings: updateSettings,
          onComplete: complete,
          onBack: back,
          onSession: (session) => {
            if (run.current === r) r.session = session;
          },
          onStart: () => {
            if (run.current === r) {
              r.attempt++;
              setSummary('');
              setError('');
            }
          },
          onStop: () => {
            auditionAbort.current?.abort();
            auditionAbort.current = undefined;
            if (run.current === r) setBusy('');
          },
          prepareListen: async (signal) => {
            auditionAbort.current?.abort();
            const abort = new AbortController();
            auditionAbort.current = abort;
            const cancel = () => abort.abort(signal.reason);
            signal.addEventListener('abort', cancel, { once: true });
            if (signal.aborted) cancel();
            setBusy('Đang chuẩn bị nghe…');
            try {
              const bridge = await ws.exerciseAudition(ready.bytes, abort.signal);
              ensureCurrent(r);
              abort.signal.throwIfAborted();
              if (r.current !== ready)
                throw new DOMException('Đã đổi bài giáo trình.', 'AbortError');
              return bridge;
            } finally {
              signal.removeEventListener('abort', cancel);
              if (auditionAbort.current === abort) {
                auditionAbort.current = undefined;
                if (alive.current && run.current === r) setBusy('');
              }
            }
          },
          controls: (
            <>
              <MethodLessonNav
                book={ready.book}
                lesson={ready.lesson}
                disabled={!!busy || ws.sessions.active}
                onSelect={(lesson) => void open(ready.book, lesson)}
              />
              {(busy || summary) && (
                <span className="method-result" role="status">
                  {busy || summary}
                </span>
              )}
            </>
          ),
          details: (
            <details className="method-source">
              <summary>Nguồn bản nhạc</summary>
              <p>
                {ready.book.title} · {methodLessonLabel(ready.lesson)}
              </p>
              <p>
                {ready.lesson.fingeringCount > 0
                  ? 'Giữ số ngón có trong bản nguồn.'
                  : 'Bản nguồn này chưa có ký hiệu số ngón.'}{' '}
                MIDI chấm nốt và nhịp; không xác định ngón tay.
              </p>
              <p>
                <a href={ready.lesson.sourceUrl} target="_blank" rel="noreferrer">
                  Xem bản nguồn
                </a>{' '}
                · {ready.lesson.license}
              </p>
            </details>
          ),
        }}
      />
    );
  }
  return (
    <main className="page methods-home">
      <div className="method-intro">
        <span className="eyebrow">LUYỆN TẬP THEO SÁCH</span>
        <h1 id="view-heading" tabIndex={-1}>
          Tập theo giáo trình
        </h1>
        <p>Chọn giáo trình và bài. Tập trên bản nhạc gốc, tiếp tục theo thứ tự của sách.</p>
      </div>
      {catalog && (
        <MethodPicker catalog={catalog} initialSelection={selection} busy={!!busy} onStart={open} />
      )}
      {busy && (
        <p className="method-loading" role="status">
          <span className="studio-spinner" aria-hidden="true" />
          {busy}
          {run.current && <button onClick={selectorView}>Hủy mở bài</button>}
        </p>
      )}
      {error && (
        <div className="method-error" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              if (catalog && lastRequest.current)
                void open(
                  lastRequest.current.book,
                  lastRequest.current.lesson,
                  lastRequest.current.settings,
                );
              else setCatalogVersion((version) => version + 1);
            }}
          >
            Thử lại
          </button>
          {run.current && <button onClick={selectorView}>Về chọn bài</button>}
        </div>
      )}
    </main>
  );
}
