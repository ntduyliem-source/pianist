import React, { useState } from 'react';
import {
  ENGINE_ID,
  type SavedAttempt,
  type AttemptResult,
  assessReleases,
  attemptCsv,
  canCompare,
  replayAttempt,
} from '../../../../../packages/practice-engine-v2';

import { workspace as ws } from '../../workspace';
import { download } from '../../platform/files';
import { noteName } from '../../platform/midi-v2';
import { percent, date, gradeText, releaseText, releaseLabel } from './presentation';
const run = (f: () => unknown) => () => void ws.run(f);

export function Results({ result: r }: { result: SavedAttempt }) {
  const [replay, setReplay] = useState('');
  if (r.schemaVersion !== 2)
    return (
      <main className="page results-page">
        <h1 id="view-heading">{r.title}</h1>
        <p>Kết quả từ bộ chấm cũ · chỉ đọc. Không replay hoặc so điểm với bộ chấm mới.</p>
        <button
          onClick={() =>
            download(JSON.stringify(r, null, 2), 'ket-qua-cu.json', 'application/json')
          }
        >
          Tải dữ liệu đã lưu
        </button>
        <button onClick={run(() => ws.openProject(r.projectId))}>Mở đúng bài trong Editor</button>
        <button onClick={() => ws.navigate('history')}>Lịch sử</button>
      </main>
    );
  const m = r.metrics,
    targets = new Map(r.timeline.targets.map((t) => [t.id, t]));
  const previous = ws.state.history.find(
    (p): p is AttemptResult => p.schemaVersion === 2 && p.id !== r.id && canCompare(p, r),
  );
  return (
    <main className="page results-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">KẾT QUẢ LUYỆN TẬP</div>
          <h1 id="view-heading" tabIndex={-1}>
            {r.title}
          </h1>
          <p>
            {date(r.createdAt)} · {r.settings.mode === 'bpm' ? 'Theo BPM' : 'Đúng nốt'} ·{' '}
            {r.settings.bpm} BPM ·{' '}
            {r.outcome === 'complete'
              ? 'Hoàn thành'
              : r.outcome === 'aborted'
                ? 'Đã dừng sớm'
                : 'Gián đoạn'}
          </p>
        </div>
        <div className="button-row">
          <button
            onClick={run(async () => {
              await ws.openProject(r.projectId, true);
              ws.updatePracticeSettings(r.settings);
            })}
          >
            Tập lại
          </button>
          <button onClick={run(() => ws.openProject(r.projectId))}>Về Editor</button>
          <button onClick={() => ws.navigate('history')}>Lịch sử</button>
        </div>
      </div>
      <div className="metric-grid">
        {[
          ['Nốt đã đánh giá', `${m.evaluated}/${m.planned}`],
          ['Nốt nhận đúng', `${m.hits} · ${percent(m.coverage)}`],
          ['Miss', m.misses],
          ['Input thừa', m.extras],
          ['Độ chính xác input', percent(m.precision)],
          ['Accuracy osu!mania', percent(m.accuracy)],
          [
            'Lệch tuyệt đối · trung vị',
            m.medianAbsMs === null ? '—' : m.medianAbsMs.toFixed(1) + ' ms',
          ],
          ['Xu hướng sớm / trễ', m.signedMeanMs === null ? '—' : m.signedMeanMs.toFixed(1) + ' ms'],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>
        Accuracy = tổng điểm judgement / (305 × số nốt đã đánh giá). Input thừa không làm giảm
        accuracy osu!; hãy đọc cùng số input thừa và độ chính xác input = nốt nhận đúng / số lần bấm
        được chấm, gồm cả lần bấm nhận Miss. Lượt dừng sớm không chấm nốt tương lai thành miss.
      </p>
      {previous && (
        <p>
          Lượt cùng điều kiện trước: {date(previous.createdAt)} · accuracy{' '}
          {percent(previous.metrics.accuracy)} · input thừa {previous.metrics.extras}.
        </p>
      )}
      {!!r.faults.length && (
        <p role="alert">
          Lỗi giao MIDI: {r.faults.join(', ')}. Không dùng lượt gián đoạn để so tiến bộ.
        </p>
      )}
      {r.simulation && (
        <p className="policy-warning">
          MIDI mô phỏng {r.simulation.deltaMs} ms · dùng kiểm thử, không tính là lượt chơi thật.
        </p>
      )}
      <div className="button-row">
        <button
          onClick={() =>
            download(JSON.stringify(r, null, 2), 'pianist-result-v2.json', 'application/json')
          }
        >
          Tải JSON
        </button>
        <button onClick={() => download(attemptCsv(r), 'pianist-notes-v2.csv', 'text/csv')}>
          Tải CSV từng nốt
        </button>
        {r.replay && r.engine === ENGINE_ID && (
          <button
            onClick={run(() => {
              const v = replayAttempt(r.timeline, r.replay!.commands);
              setReplay(
                JSON.stringify(v.judgements) === JSON.stringify(r.judgements) &&
                  JSON.stringify(v.extras) === JSON.stringify(r.extras) &&
                  JSON.stringify(v.intervals) === JSON.stringify(r.intervals) &&
                  JSON.stringify(v.pedalIntervals) === JSON.stringify(r.pedalIntervals) &&
                  JSON.stringify(v.controls) === JSON.stringify(r.controls) &&
                  JSON.stringify(assessReleases(r.timeline, v, r.outcome)) === JSON.stringify(r.r4)
                  ? 'Replay khớp BPM, trường độ, pedal và trạng thái MIDI.'
                  : 'Replay không khớp. Giữ file JSON để kiểm tra.',
              );
            })}
          >
            Kiểm chứng replay
          </button>
        )}
        <span role="status">{replay}</span>
      </div>
      <p className="muted">
        Nguồn: osu! 676f3b0 · Piano Trainer Studio b40e412 · mir_eval fe73b35 · Magenta note-seq
        3582550. Nhả phím theo lịch phát MuseScore; pedal nhị phân CC64.
      </p>
      {r.r4 ? (
        <ReleaseResults result={r} />
      ) : (
        <p>Kết quả trước R4: giữ nguyên dữ liệu đã lưu, không chấm lại bằng bộ luật mới.</p>
      )}
      <div className="result-box">
        <h2>Từng nốt đã chấm</h2>
        <table>
          <thead>
            <tr>
              <th>Ô / vòng</th>
              <th>Nốt</th>
              <th>Kết quả</th>
              <th>Sớm / trễ</th>
              <th>Tập đoạn</th>
            </tr>
          </thead>
          <tbody>
            {r.judgements.slice(0, 1000).map((j) => {
              const t = targets.get(j.id)!;
              return (
                <tr key={j.id}>
                  <td>
                    {t.measure + 1} / {t.loop + 1}
                  </td>
                  <td>{noteName(t.pitch)}</td>
                  <td>{r.settings.mode === 'wait' ? 'Đúng nốt' : gradeText[j.grade]}</td>
                  <td>
                    {j.seq === null || r.settings.mode === 'wait'
                      ? '—'
                      : j.delta.toFixed(1) + ' ms'}
                  </td>
                  <td>
                    <button
                      onClick={run(async () => {
                        await ws.openProject(r.projectId, true);
                        ws.updatePracticeSettings({
                          ...r.settings,
                          fromMeasure: t.measure,
                          toMeasure: t.measure,
                        });
                      })}
                    >
                      Ô {t.measure + 1}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {r.judgements.length > 1000 && <p>Hiển thị 1.000 nốt đầu; CSV có toàn bộ dữ liệu.</p>}
      </div>
    </main>
  );
}

function ReleaseResults({ result: r }: { result: AttemptResult }) {
  const report = r.r4!,
    pedal = report.pedal,
    targets = new Map(r.timeline.targets.map((t) => [t.id, t])),
    sound = new Map(report.sound.map((n) => [n.id, n]));
  const states = [
    'correct',
    'early',
    'late',
    'unreleased',
    'interrupted',
    'unavailable',
    'no-attack',
  ] as const;
  const reasons = {
    disabled: 'Đã tắt pedal cho lượt này.',
    wait: 'Chế độ Đúng nốt không chấm thời gian nhả hoặc pedal.',
    'no-reference': 'Không có chỉ dẫn pedal cho phần đang chọn; chỉ ghi dữ liệu CC64.',
    partial: 'Lượt chưa hoàn tất hoặc pedal chưa được nhả đầy đủ; không công bố F1 hoàn chỉnh.',
    scored: '',
  };
  return (
    <section className="result-box">
      <h2>Trường độ và pedal</h2>
      {!!report.key.length && (
        <>
          <div className="metric-grid">
            {states.map((state) => (
              <div className="metric" key={state}>
                <span>{releaseText[state]}</span>
                <strong>{report.key.filter((n) => n.status === state).length}</strong>
              </div>
            ))}
          </div>
          <p>
            Nhả phím: so với Note Off do MuseScore phát; dung sai mir_eval = max(20% trường độ tham
            chiếu, 50 ms). Âm ngân dùng sustain của Magenta, có xử lý đánh lại cùng cao độ. Các phép
            đo này không thay đổi accuracy BPM.
          </p>
          <table>
            <thead>
              <tr>
                <th>Ô / vòng · nốt</th>
                <th>Nhả phím</th>
                <th>Mốc / dung sai</th>
                <th>Âm ngân</th>
              </tr>
            </thead>
            <tbody>
              {report.key.slice(0, 1000).map((n) => {
                const t = targets.get(n.id)!;
                return (
                  <tr key={n.id}>
                    <td>
                      {t.measure + 1} / {t.loop + 1} · {noteName(t.pitch)}
                    </td>
                    <td>{releaseLabel(n)}</td>
                    <td>
                      {n.expectedMs === null
                        ? '—'
                        : `${n.expectedMs.toFixed(1)} ms · ±${n.toleranceMs!.toFixed(1)} ms`}
                    </td>
                    <td>{releaseLabel(sound.get(n.id))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {!report.key.length && <p>Chấm trường độ đã tắt hoặc lượt dùng chế độ Đúng nốt.</p>}
      <h3>Pedal CC64</h3>
      <p>
        {reasons[pedal.status] ||
          `F1 ${percent(pedal.f1)} · Precision ${percent(pedal.precision)} · Recall ${percent(pedal.recall)}.`}{' '}
        {pedal.matching.length}/{pedal.reference} đoạn khớp · {pedal.performed} lần đạp/nhả hoàn
        chỉnh · {pedal.interrupted} lần chưa nhả hoặc bị ngắt.
      </p>
      {pedal.status === 'scored' && (
        <>
          <p>
            Profile piano_transcription / mir_eval: thời điểm đạp ±200 ms; nhả ±max(20% đoạn pedal,
            50 ms). Không đánh giá độ sâu pedal hoặc diễn cảm.
          </p>
          <table>
            <thead>
              <tr>
                <th>Đoạn / vòng</th>
                <th>Đạp → nhả tham chiếu</th>
                <th>Thực tế</th>
              </tr>
            </thead>
            <tbody>
              {pedal.targets.slice(0, 1000).map((p, i) => {
                const match = pedal.matching.find(([ref]) => ref === i),
                  actual = match ? pedal.intervals[match[1]] : undefined;
                return (
                  <tr key={p.id}>
                    <td>
                      {i + 1} / {p.loop + 1}
                    </td>
                    <td>
                      {p.atMs.toFixed(0)} → {p.endMs.toFixed(0)} ms
                    </td>
                    <td>
                      {actual
                        ? `${actual.onMs.toFixed(0)} → ${actual.offMs!.toFixed(0)} ms`
                        : 'Chưa khớp'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
