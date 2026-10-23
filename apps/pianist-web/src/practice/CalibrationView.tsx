import React, { useEffect, useRef, useState } from 'react';
import type { PracticeSettings } from '../../../../packages/practice-engine-v2/model';
import { calibrationTimeline, calibrationReport } from '../platform/calibration-v2';
import { PracticeController } from './controller-v2';
import { workspace as ws } from '../workspace';

export function CalibrationView({
  settings,
  onApply,
}: {
  settings: PracticeSettings;
  onApply: (offset: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<PracticeController | undefined>(undefined),
    unsubscribe = useRef<() => void>(() => {});
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState(''),
    [report, setReport] = useState<ReturnType<typeof calibrationReport> | null>(null);
  const stop = () => {
    unsubscribe.current();
    controller.current?.dispose();
    controller.current = undefined;
    setRunning(false);
  };
  useEffect(() => {
    const lost = () => {
      if (controller.current) {
        stop();
        setMessage('Đã hủy phép đo vì mất focus. Bắt đầu lại để có đồng hồ liên tục.');
      }
    };
    window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('blur', lost);
      unsubscribe.current();
      controller.current?.dispose();
    };
  }, []);
  async function start() {
    stop();
    setReport(null);
    setRunning(true);
    let pitch: number | undefined;
    const c = (controller.current = new PracticeController(
      calibrationTimeline({
        ...settings,
        inputSource: ws.midi.deviceId === 'virtual' ? 'virtual' : 'midi',
        deviceId: ws.midi.deviceId,
      }),
      'Đo bù trễ',
      async () => (await ws.ensureEngine(true)).api.Module.driver,
    ));
    c.onChange = () =>
      setMessage(
        c.status === 'counting'
          ? 'Đếm vào 4 phách…'
          : `${c.view.judgements.length}/12 phách · bấm cùng tiếng click`,
      );
    c.onComplete = (r) => {
      setReport(calibrationReport(r));
      stop();
      setMessage(
        'Đã đo xong. Đây là độ lệch của cả thiết bị và cách bạn bấm, không phải phép đo độ trễ phần cứng riêng.',
      );
    };
    unsubscribe.current = ws.midi.subscribe((e) => {
      if (e.kind === 'on' && pitch === undefined) pitch = e.pitch;
      if (e.pitch === pitch && e.kind !== 'pedal') c.input({ ...e, pitch: 60 });
    });
    try {
      await c.start(() => []);
    } catch (e) {
      stop();
      setMessage(String(e));
    }
  }
  return (
    <>
      <button onClick={() => dialog.current?.showModal()}>Đo bù trễ bằng 12 phách…</button>
      <dialog ref={dialog} onCancel={stop} onClose={stop} aria-label="Đo bù trễ MIDI">
        <h2>Đo bù trễ</h2>
        <p>
          Sau 4 tiếng đếm vào, bấm và nhả cùng một phím theo 12 tiếng click. Dùng một phím duy nhất;
          với bàn phím ảo, bấm nút bên dưới.
        </p>
        <p>
          Phép đo dùng đúng cửa sổ osu!mania OD 0. Cần ít nhất 8/12 lần bấm trong cửa sổ để đề xuất;
          không tự thay offset của lượt tập.
        </p>
        <p role="status">{message}</p>
        {report && (
          <p>
            Nhận {report.count}/12 · lệch trung vị {report.offset ?? '—'} ms · khoảng P10–P90{' '}
            {report.spread ?? '—'} ms.
          </p>
        )}
        <div className="button-row">
          <button disabled={running} onClick={() => void start()}>
            Bắt đầu đo
          </button>
          <button
            disabled={!running || ws.midi.deviceId !== 'virtual'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              ws.midi.virtual(60, true);
            }}
            onPointerUp={() => ws.midi.virtual(60, false)}
            onPointerCancel={() => ws.midi.virtual(60, false)}
          >
            Bấm theo click
          </button>
          {report?.eligible && (
            <button
              onClick={() => {
                onApply(report.offset!);
                dialog.current?.close();
              }}
            >
              Áp dụng {report.offset} ms
            </button>
          )}
          <button
            onClick={() => {
              stop();
              dialog.current?.close();
            }}
          >
            Đóng
          </button>
        </div>
      </dialog>
    </>
  );
}
