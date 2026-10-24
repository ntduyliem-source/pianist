import React, { useEffect } from 'react';
import { workspace as ws } from '../workspace';
import { noteName } from '../platform/midi-v2';

export function PracticePiano({
  held,
  expected,
  expanded,
  onToggle,
  hidden,
  tools,
}: {
  held: number[];
  expected: number[];
  expanded: boolean;
  onToggle: () => void;
  hidden: boolean;
  tools?: React.ReactNode;
}) {
  const notes = Array.from({ length: 88 }, (_, i) => 21 + i),
    black = (n: number) => [1, 3, 6, 8, 10].includes(n % 12),
    white = notes.filter((n) => !black(n));
  useEffect(() => {
    const keys = [
        'a',
        'w',
        's',
        'e',
        'd',
        'f',
        't',
        'g',
        'y',
        'h',
        'u',
        'j',
        'k',
        'o',
        'l',
        'p',
        ';',
      ],
      pressed = new Map<string, number>();
    const release = () => {
      for (const n of pressed.values()) ws.midi.virtual(n, false);
      pressed.clear();
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector('dialog[open]') ||
        (e.target as HTMLElement).closest('input,select,textarea')
      )
        return;
      const i = keys.indexOf(e.key.toLowerCase());
      if (i < 0) return;
      e.preventDefault();
      pressed.set(e.code, 60 + i);
      ws.midi.virtual(60 + i, true);
    };
    const up = (e: KeyboardEvent) => {
      const n = pressed.get(e.code);
      if (n !== undefined) {
        ws.midi.virtual(n, false);
        pressed.delete(e.code);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);
  const button = (n: number) => ({
    'aria-label': noteName(n),
    'aria-pressed': held.includes(n),
    'data-midi': n,
    title: noteName(n),
    disabled: ws.midi.deviceId !== 'virtual',
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      ws.midi.virtual(n, true);
    },
    onPointerUp: () => ws.midi.virtual(n, false),
    onPointerCancel: () => ws.midi.virtual(n, false),
    onLostPointerCapture: () => ws.midi.virtual(n, false),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ([' ', 'Enter'].includes(e.key) && !e.repeat) {
        e.preventDefault();
        ws.midi.virtual(n, true);
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if ([' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        ws.midi.virtual(n, false);
      }
    },
    onBlur: () => ws.midi.virtual(n, false),
  });
  return (
    <section className="practice-piano" hidden={hidden} aria-label="Bàn phím hỗ trợ">
      <div className="practice-piano-heading">
        <span>
          <strong>Bàn phím · 88 phím</strong>
          <span className="v2-muted">
            {' '}
            · A0–C8 · {held.length ? held.map(noteName).join(' · ') : 'Chưa giữ phím'}
          </span>
        </span>
        {tools}
        <button aria-expanded={expanded} aria-controls="practice-keyboard" onClick={onToggle}>
          {expanded ? '⌄ Thu gọn' : '⌃ Mở bàn phím'}
        </button>
      </div>
      <div
        id="practice-keyboard"
        className="piano"
        role="group"
        aria-label="Piano 88 phím A0–C8"
        hidden={!expanded}
      >
        {white.map((n) => (
          <button
            key={n}
            {...button(n)}
            className={
              'white-key' +
              (expected.includes(n) ? ' expected' : '') +
              (held.includes(n) ? ' held' : '')
            }
            style={{ width: 100 / white.length + '%' }}
          >
            <span>{noteName(n)}</span>
          </button>
        ))}
        {notes.filter(black).map((n) => (
          <button
            key={n}
            {...button(n)}
            className={
              'black-key' +
              (expected.includes(n) ? ' expected' : '') +
              (held.includes(n) ? ' held' : '')
            }
            style={{
              width: 65 / white.length + '%',
              left: ((white.filter((x) => x < n).length - 0.325) * 100) / white.length + '%',
            }}
          >
            <span>{noteName(n)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
