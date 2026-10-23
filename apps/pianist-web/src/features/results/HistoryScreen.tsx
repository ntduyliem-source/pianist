import React, { useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import { date } from './presentation';

export function History() {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  return (
    <main className="page history-page">
      <div className="page-title">
        <h1 id="view-heading" tabIndex={-1}>
          Lịch sử luyện tập
        </h1>
        <button onClick={() => ws.navigate('library')}>Thư viện</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Bài / thời điểm</th>
            <th>Bộ chấm</th>
            <th>Kết quả</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.history.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title}
                <br />
                {date(r.createdAt)}
              </td>
              <td>{r.schemaVersion === 2 ? 'V2 · osu! / PTS' : 'Bản cũ · chỉ đọc'}</td>
              <td>
                {r.schemaVersion === 2
                  ? `${r.metrics.hits}/${r.metrics.evaluated} nốt · ${r.metrics.extras} input thừa`
                  : 'Giữ nguyên dữ liệu đã lưu'}
              </td>
              <td>
                <button
                  onClick={() => {
                    ws.patch({ result: r });
                    ws.navigate('results');
                  }}
                >
                  Xem kết quả
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!state.history.length && <p>Chưa có lượt tập được lưu.</p>}
    </main>
  );
}
