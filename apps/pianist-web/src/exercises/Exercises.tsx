import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../workspace';
import { Practice } from '../practice/PracticeScreen';
import type { PracticeController } from '../practice/controller-v2';
import { ExerciseRenderer } from '../../../../packages/exercise-renderer';
import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import {
  createTimeline,
  type AttemptResult,
  type PracticeSettings,
} from '../../../../packages/practice-engine-v2';

import { loadBank, getData, putData, type Bank, type Exercise, type Hand } from './bank';
import { ExerciseSelector, type QueueItem } from './selector';
import { RetryableLoad } from './retryable-load';
import { exerciseSettings, readSelection, DEFAULT_SELECTION, type Selection } from './settings';
import { GRADES, LENGTH_BUCKETS } from './definition';
import * as libraryStorage from '../platform/storage';
import './exercises.css';

const handName: Record<Hand, string> = { right: 'Tay phải', left: 'Tay trái', both: 'Hai tay' };
const fallbackBuckets = LENGTH_BUCKETS.map(({ id, pickerLabel, min, max }) => ({
  id,
  label: pickerLabel,
  min,
  max,
}));
type Ready = QueueItem & { bytes: Uint8Array; snapshot: ScoreSnapshot };
type Run = {
  session?: PracticeController;
  abort: AbortController;
  renderer: ExerciseRenderer;
  selector: ExerciseSelector;
  queue: RetryableLoad<Ready>[];
  bank: Bank;
  selection: Selection;
  current?: Ready;
  manual: boolean;
  advancing: boolean;
  completing?: Ready;
  attemptToken: number;
  advanceToken: number;
  stopped: boolean;
};
const message = (e: unknown) => String(e instanceof Error ? e.message : e);
function briefResult(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, 700);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Đã dừng lượt.', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

export function Exercises() {
  useSyncExternalStore(ws.subscribe, ws.snapshot);
  const sessionStatus = useSyncExternalStore(
    ws.sessions.subscribeStatus,
    ws.sessions.statusSnapshot,
  );
  const [bank, setBank] = useState<Bank>(),
    [selection, setSelection] = useState<Selection>(() => readSelection(DEFAULT_SELECTION)),
    [rows, setRows] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState('Đang tải kho theo grade…'),
    [error, setError] = useState(''),
    [ready, setReady] = useState<Ready>(),
    [config, setConfig] = useState<PracticeSettings>();
  const [nextLabel, setNextLabel] = useState(''),
    [summary, setSummary] = useState(''),
    [autoStart, setAutoStart] = useState(0),
    [simulation, setSimulation] = useState<{ deltaMs: number; reference: boolean }>();
  const [catalogVersion, setCatalogVersion] = useState(0);
  const run = useRef<Run | undefined>(undefined),
    alive = useRef(true),
    choice = useRef(selection),
    lastConfig = useRef(config),
    advanceRef = useRef<((auto?: boolean) => Promise<void>) | undefined>(undefined),
    settingsChanged = useRef(false);
  const auditionAbort = useRef<AbortController | undefined>(undefined);
  choice.current = selection;
  lastConfig.current = config;
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
    lastConfig.current = undefined;
    setBusy('');
    setError('');
    setSummary('');
    setSimulation(undefined);
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
    const deviceId = ws.midi.deviceId,
      r = run.current;
    if (
      !config ||
      config.deviceId === deviceId ||
      !r ||
      (ws.session && !['ready', 'finished'].includes(ws.session.status))
    )
      return;
    setConfig((c) =>
      c
        ? { ...c, deviceId, inputSource: deviceId === 'virtual' ? 'virtual' : 'midi', offsetMs: 0 }
        : c,
    );
    void libraryStorage
      .get<{ id: string; offsetMs: number }>('settings', 'calibration-v2:' + deviceId)
      .then((profile) => {
        if (
          !alive.current ||
          run.current !== r ||
          ws.midi.deviceId !== deviceId ||
          (ws.session && !['ready', 'finished'].includes(ws.session.status))
        )
          return;
        setConfig((c) =>
          c && c.deviceId === deviceId ? { ...c, offsetMs: profile?.offsetMs ?? 0 } : c,
        );
      })
      .catch((e) => {
        if (alive.current && run.current === r && ws.midi.deviceId === deviceId)
          setError(message(e));
      });
  }, [ws.midi.deviceId, config?.deviceId, sessionStatus]);
  useEffect(() => {
    void getData<{ id: string; selection: unknown }>('settings', 'selection-composed-v1')
      .then((s) => {
        if (s && alive.current && !settingsChanged.current)
          setSelection(readSelection(s.selection));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setBusy('Đang tải kho theo grade…');
    setError('');
    setBank(undefined);
    setRows([]);
    void loadBank(abort.signal)
      .then((b) => {
        if (!abort.signal.aborted) setBank(b);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy('');
      });
    return () => abort.abort();
  }, [catalogVersion]);
  const lengthKey = selection.lengths.join(',');
  useEffect(() => {
    setRows([]);
    if (!bank) return;
    const abort = new AbortController();
    setError('');
    const options = bank.index.options.filter(
      (o) => o.grade === selection.grade && selection.lengths.includes(o.lengthBucket),
    );
    if (!options.length) {
      setBusy('');
      return;
    }
    setBusy('Đang tải danh sách bài…');
    void Promise.all(options.map((o) => bank.option(o, abort.signal)))
      .then((groups) => {
        if (!abort.signal.aborted)
          setRows([...new Map(groups.flat().map((e) => [e.id, e])).values()]);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy('');
      });
    return () => abort.abort();
  }, [bank, selection.grade, lengthKey]);
  const change = (patch: Partial<Selection>) => {
    settingsChanged.current = true;
    if (run.current && !ready) selectorView();
    const next = readSelection({ ...choice.current, ...patch });
    choice.current = next;
    setSelection(next);
    void putData('settings', { id: 'selection-composed-v1', selection: next }).catch((e) => {
      if (alive.current) setError(message(e));
    });
  };
  const ensureCurrent = (r: Run) => {
    r.abort.signal.throwIfAborted();
    if (run.current !== r || !alive.current) throw new DOMException('Đã đổi lượt.', 'AbortError');
  };
  const fill = (r: Run) => {
    while (r.queue.length < 3) {
      const queued = r.selector.take();
      if (!queued) break;
      const pending = new RetryableLoad<Ready>(async () => {
        const entry = queued.entry,
          bytes = await r.bank.bytes(entry, r.abort.signal);
        ensureCurrent(r);
        const rendered = await r.renderer.prepare(bytes, entry.scoreId + '.mxl', r.abort.signal);
        ensureCurrent(r);
        const snapshot: ScoreSnapshot = {
          ...rendered.snapshot,
          title: entry.title,
          projectId: 'grade:' + entry.id,
          fingerprint: entry.sha256,
        };
        if (rendered.sourceHash !== entry.sha256) throw Error('Renderer nhận sai bài theo grade.');
        if (snapshot.staves.length !== 2) throw Error('Bài theo grade phải giữ đủ hai khuông.');
        const full = exerciseSettings(
          snapshot,
          entry,
          { ...r.selection, hand: 'both' },
          ws.midi.deviceId,
        );
        const total = createTimeline(snapshot, full).targets.length;
        const right = createTimeline(snapshot, { ...full, hand: 'right' }).targets.length;
        const left = createTimeline(snapshot, { ...full, hand: 'left' }).targets.length;
        if (total !== entry.targetCount || right !== entry.countRight || left !== entry.countLeft)
          throw Error('Số nốt hai tay sau khi dựng không khớp bản đã kiểm.');
        return { ...queued, bytes, snapshot };
      });
      void pending.read().catch(() => {});
      r.queue.push(pending);
    }
    const next = r.queue[0];
    if (next)
      void next
        .read()
        .then((item) => {
          if (run.current === r && r.queue[0] === next) setNextLabel(item.entry.title);
        })
        .catch(() => {
          if (run.current === r && r.queue[0] === next) setNextLabel('Chưa tải được bài kế');
        });
  };
  const advance = async (auto = false) => {
    const r = run.current;
    if (!r || r.advancing) return;
    const advanceToken = ++r.advanceToken;
    const ensureAdvance = () => {
      ensureCurrent(r);
      if (r.advanceToken !== advanceToken)
        throw new DOMException('Đã dừng chuyển bài.', 'AbortError');
    };
    r.advancing = true;
    setError('');
    setBusy('Đang chuẩn bị khuông nhạc…');
    auditionAbort.current?.abort();
    try {
      ensureCurrent(r);
      ws.bridge?.audition('reset');
      ws.sessions.dispose(r.session);
      r.session = undefined;
      ws.midi.release();
      fill(r);
      const pending = r.queue[0];
      if (!pending) throw Error('Lựa chọn này chưa có bài.');
      const item = await pending.read();
      ensureAdvance();
      const prior = lastConfig.current,
        next = exerciseSettings(item.snapshot, item.entry, choice.current, ws.midi.deviceId);
      if (prior) {
        for (const key of [
          'mode',
          'bpm',
          'hand',
          'accompaniment',
          'difficulty',
          'countIn',
          'metronome',
          'pedalEnabled',
          'durationEnabled',
          'offsetMs',
        ] as const)
          (next as any)[key] = prior[key];
      }
      if (!prior || prior.deviceId !== ws.midi.deviceId) {
        const calibration = await libraryStorage.get<{ id: string; offsetMs: number }>(
          'settings',
          'calibration-v2:' + ws.midi.deviceId,
        );
        ensureAdvance();
        next.offsetMs = calibration?.offsetMs ?? 0;
      }
      // Stop retains this slot at the head; another Next resumes the same
      // authored position instead of skipping the item that was being prepared.
      r.queue.shift();
      r.current = item;
      r.completing = undefined;
      setReady(item);
      setConfig(next);
      lastConfig.current = next;
      fill(r);
      if (auto) setAutoStart((n) => n + 1);
    } catch (e) {
      if (run.current === r && r.advanceToken === advanceToken && !r.abort.signal.aborted)
        setError(message(e));
    } finally {
      if (r.advanceToken === advanceToken) {
        r.advancing = false;
        if (run.current === r) setBusy('');
      }
    }
  };
  advanceRef.current = advance;
  const begin = async () => {
    if (!bank || !rows.length || busy || !selection.lengths.length) return;
    settingsChanged.current = true;
    stopRun();
    setSummary('');
    setSimulation(undefined);
    setAutoStart(0);
    lastConfig.current = undefined;
    setConfig(undefined);
    setReady(undefined);
    ws.patch({ practicePicker: false });
    const r: Run = {
      abort: new AbortController(),
      renderer: new ExerciseRenderer(),
      selector: new ExerciseSelector(rows, selection.random),
      queue: [],
      bank,
      selection: { ...selection, lengths: [...selection.lengths] },
      manual: false,
      advancing: false,
      attemptToken: 0,
      advanceToken: 0,
      stopped: false,
    };
    run.current = r;
    await advance();
  };
  const manualNext = async (exit = false) => {
    const r = run.current;
    if (!r || r.advancing || r.manual) return;
    r.manual = true;
    const attemptToken = r.attemptToken;
    try {
      const closing = r.session;
      if (closing && !['ready', 'finished'].includes(closing.status)) {
        await closing.finish();
        ensureCurrent(r);
        if (r.attemptToken !== attemptToken) return;
        if (closing.status !== 'finished') throw Error('Chưa kết thúc được lượt.');
      }
      ensureCurrent(r);
      if (r.attemptToken !== attemptToken) return;
      if (exit) selectorView();
      else {
        setSimulation(undefined);
        await advance();
      }
    } finally {
      if (r.attemptToken === attemptToken) r.manual = false;
    }
  };
  const complete = async (result: AttemptResult) => {
    const r = run.current,
      item = ready;
    if (!r || !item || r.current !== item || r.completing === item) return;
    r.completing = item;
    const manual = r.manual,
      attemptToken = r.attemptToken;
    try {
      await putData('attempts', {
        id: 'last',
        releaseId: r.bank.index.releaseId,
        exerciseId: item.entry.id,
        result,
      });
      ensureCurrent(r);
      if (r.current !== item || r.attemptToken !== attemptToken) return;
      setSummary(
        `${result.metrics.hits}/${result.metrics.planned} nốt · ${result.metrics.misses} bỏ lỡ · ${result.metrics.extras} thừa${result.settings.mode === 'bpm' && result.metrics.accuracy !== null ? ' · ' + (result.metrics.accuracy * 100).toFixed(1) + '%' : ''}${result.simulation ? ' · Mô phỏng' : ''}`,
      );
      if (result.outcome === 'complete' && !manual && !r.stopped && choice.current.auto) {
        await briefResult(r.abort.signal);
        ensureCurrent(r);
        if (
          r.current !== item ||
          r.manual ||
          r.stopped ||
          !choice.current.auto ||
          r.attemptToken !== attemptToken
        )
          return;
        setSimulation(
          result.simulation
            ? {
                deltaMs: result.simulation.deltaMs,
                reference: result.simulation.script === 'native-release-pedal',
              }
            : undefined,
        );
        await advanceRef.current?.(true);
      }
    } catch (e) {
      if (run.current === r && !r.abort.signal.aborted) setError(message(e));
    } finally {
      if (r.completing === item && r.attemptToken === attemptToken) r.completing = undefined;
    }
  };
  const updateSettings = (patch: Partial<PracticeSettings>) => {
    const allowed = [
      'mode',
      'bpm',
      'hand',
      'accompaniment',
      'countIn',
      'difficulty',
      'metronome',
      'pedalEnabled',
      'durationEnabled',
      'offsetMs',
      'deviceId',
      'inputSource',
    ] as const;
    setConfig((c) => {
      if (!c) return c;
      const next = { ...c };
      for (const key of allowed) if (key in patch) (next as any)[key] = patch[key];
      return next;
    });
    const prefs: Partial<Selection> = {};
    if (patch.mode) prefs.mode = patch.mode;
    if (patch.bpm !== undefined) prefs.bpm = patch.bpm;
    if (patch.hand) prefs.hand = patch.hand;
    if (Object.keys(prefs).length) change(prefs);
    if (
      patch.offsetMs !== undefined &&
      Number.isFinite(patch.offsetMs) &&
      Math.abs(patch.offsetMs) <= 500
    )
      void libraryStorage
        .put('settings', { id: 'calibration-v2:' + ws.midi.deviceId, offsetMs: patch.offsetMs })
        .catch((e) => {
          if (alive.current) setError(message(e));
        });
  };
  if (ready && config && run.current) {
    const r = run.current,
      selectedCount =
        config.hand === 'right'
          ? ready.entry.countRight
          : config.hand === 'left'
            ? ready.entry.countLeft
            : ready.entry.targetCount;
    return (
      <Practice
        snapshot={ready.snapshot}
        config={config}
        exercise={{
          autoStart,
          simulation,
          loading: !!busy,
          error,
          onSettings: updateSettings,
          onComplete: complete,
          onSession: (session) => {
            if (run.current === r) r.session = session;
          },
          onStart: () => {
            if (run.current === r) {
              r.attemptToken++;
              r.stopped = false;
              r.completing = undefined;
            }
          },
          onStop: () => {
            if (run.current !== r) return;
            r.attemptToken++;
            r.advanceToken++;
            r.advancing = false;
            r.manual = false;
            r.stopped = true;
            r.completing = undefined;
            const pending = auditionAbort.current;
            auditionAbort.current = undefined;
            pending?.abort();
            setSimulation(undefined);
            setBusy('');
          },
          prepareListen: async (signal) => {
            auditionAbort.current?.abort();
            const abort = (auditionAbort.current = new AbortController());
            const cancel = () => abort.abort(signal.reason);
            signal.addEventListener('abort', cancel, { once: true });
            if (signal.aborted) cancel();
            setBusy('Đang chuẩn bị nghe…');
            try {
              const bridge = await ws.exerciseAudition(ready.bytes, abort.signal);
              ensureCurrent(r);
              abort.signal.throwIfAborted();
              if (r.current !== ready) throw new DOMException('Đã đổi bài.', 'AbortError');
              return bridge;
            } finally {
              signal.removeEventListener('abort', cancel);
              if (auditionAbort.current === abort) {
                auditionAbort.current = undefined;
                if (run.current === r && alive.current) setBusy('');
              }
            }
          },
          controls: (
            <>
              <button
                onClick={() => (busy ? selectorView() : void ws.run(() => manualNext(true)))}
                aria-label="Chọn grade và độ dài"
              >
                ‹ Dừng · Chọn bài
              </button>
              <span
                className="exercise-current"
                data-testid="grade-progress"
                data-exercise-id={ready.entry.id}
                data-score-id={ready.entry.scoreId}
                data-round={ready.round}
                data-position={ready.position}
                data-target-count={ready.entry.targetCount}
              >
                G{r.selection.grade} · {handName[config.hand]} · {selectedCount}/
                {ready.entry.targetCount} nốt · Vòng {ready.round} · {ready.position}/{ready.total}
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={selection.auto}
                  onChange={(e) => change({ auto: e.target.checked })}
                />
                Tự chuyển
              </label>
              <button
                onClick={() => void ws.run(() => manualNext())}
                disabled={!!busy}
                aria-label="Bài kế tiếp"
              >
                Bài kế ›
              </button>
              <span role="status" className="exercise-summary">
                {busy || summary}
              </span>
            </>
          ),
          details: (
            <details>
              <summary>{ready.entry.scoreId} · Thông tin bài & bài kế</summary>
              <p>
                Bài có {ready.entry.targetCount} lần đánh: tay phải {ready.entry.countRight}, tay
                trái {ready.entry.countLeft}. Luôn hiển thị đủ hai khuông; chỉ chấm tay đã chọn.
              </p>
              <p>
                Bài kế: {nextLabel}.{' '}
                {r.selection.random
                  ? 'Random không lặp trong vòng; giãn cùng chủ đề khi còn lựa chọn.'
                  : 'Theo thứ tự trong từng tập, luân phiên các khoảng đã chọn.'}{' '}
                Hết danh sách bắt đầu vòng mới.
              </p>
              <p>
                Đúng nốt: nhận đủ nốt mới sang bài. BPM: hết lượt thì báo kết quả và đếm vào bài
                tiếp; kết thúc lượt không đồng nghĩa đạt. Mỗi bài có đếm vào riêng.
              </p>
            </details>
          ),
        }}
      />
    );
  }
  const buckets = bank?.index.lengthBuckets ?? fallbackBuckets;
  return (
    <main className="page exercises-home">
      <div className="exercise-intro">
        <div>
          <h1 id="view-heading" tabIndex={-1}>
            Tập theo grade
          </h1>
          <p>Chọn một grade, một hoặc nhiều khoảng nốt rồi tập liên tục trên sheet hai khuông.</p>
        </div>
        <strong className="exercise-total">
          {bank ? bank.index.total.toLocaleString('vi') : '—'}
          <small>bài · {GRADES.length} grade</small>
        </strong>
      </div>
      <section className="exercise-choices" aria-label="Chọn bài theo grade">
        <div className="exercise-grade-picker">
          <label>
            Grade
            <select
              aria-label="Grade"
              value={selection.grade}
              onChange={(e) => change({ grade: +e.target.value })}
            >
              {GRADES.map(({ id, title }) => (
                <option key={id} value={id}>
                  G{id} · {title}
                </option>
              ))}
            </select>
          </label>
          <p>{GRADES.find((grade) => grade.id === selection.grade)?.description}</p>
        </div>
        <fieldset className="exercise-length-field">
          <legend>
            Khoảng nốt <span>· chọn nhiều</span>
          </legend>
          <div className="exercise-lengths">
            {buckets.map((b) => {
              const count =
                bank?.index.options.find(
                  (o) => o.grade === selection.grade && o.lengthBucket === b.id,
                )?.count ?? 0;
              return (
                <label key={b.id} className={selection.lengths.includes(b.id) ? 'selected' : ''}>
                  <span className="exercise-length-heading">
                    <input
                      type="checkbox"
                      aria-label={'Khoảng ' + b.id.slice(1) + ' nốt'}
                      checked={selection.lengths.includes(b.id)}
                      onChange={(e) =>
                        change({
                          lengths: e.target.checked
                            ? [...selection.lengths, b.id]
                            : selection.lengths.filter((id) => id !== b.id),
                        })
                      }
                    />
                    <strong>~{b.id.slice(1)} nốt</strong>
                  </span>
                  <small>
                    {b.min}–{b.max} nốt · {count} bài
                  </small>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="exercise-random">
          <input
            type="checkbox"
            aria-label="Random"
            checked={selection.random}
            onChange={(e) => change({ random: e.target.checked })}
          />
          <strong>Random</strong>
          <span>
            {selection.random
              ? 'Trộn, không lặp trong vòng.'
              : 'Theo thứ tự trong tập, luân phiên các khoảng.'}
          </span>
        </label>
        <div className="exercise-fields">
          <label>
            Tay tập
            <select
              aria-label="Tay tập theo grade"
              value={selection.hand}
              onChange={(e) => change({ hand: e.target.value as Hand })}
            >
              {Object.entries(handName).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chế độ
            <select
              aria-label="Chế độ tập theo grade"
              value={selection.mode}
              onChange={(e) => change({ mode: e.target.value as Selection['mode'] })}
            >
              <option value="bpm">Theo BPM</option>
              <option value="wait">Đúng nốt</option>
            </select>
          </label>
          <label>
            BPM
            <input
              aria-label="BPM theo grade"
              type="number"
              min={20}
              max={300}
              value={selection.bpm}
              onChange={(e) => change({ bpm: +e.target.value || 20 })}
            />
          </label>
        </div>
        <div className="exercise-launch">
          <div>
            <strong data-testid="grade-count">
              {rows.length.toLocaleString('vi')} bài phù hợp
            </strong>
            <p>
              {selection.lengths.length
                ? 'Độ dài tính số lần đánh của cả hai tay. Chọn một tay vẫn giữ nguyên sheet.'
                : 'Chọn ít nhất một khoảng nốt để bắt đầu.'}
            </p>
          </div>
          <button
            className="primary"
            aria-label="Bắt đầu tập theo grade"
            disabled={!!busy || !rows.length || !selection.lengths.length}
            onClick={() => void ws.run(begin)}
          >
            Bắt đầu tập →
          </button>
        </div>
        <p className="exercise-help">
          G1–G8 là grade nội bộ Pianist. Kho đã biên soạn sẵn; khi tập chỉ chọn và sắp thứ tự bài.
        </p>
      </section>
      {busy && (
        <p role="status">
          {busy} {run.current && <button onClick={selectorView}>Hủy chuẩn bị</button>}
        </p>
      )}
      {error && (
        <p className="exercise-error" role="alert">
          {error}{' '}
          <button
            onClick={() => {
              stopRun();
              ws.patch({ practicePicker: true });
              setCatalogVersion((n) => n + 1);
            }}
          >
            Thử tải lại
          </button>
        </p>
      )}
    </main>
  );
}
