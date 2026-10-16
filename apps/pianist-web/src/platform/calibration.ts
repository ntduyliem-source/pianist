import type { InputEvent, Plan, SessionConfig } from '../../../../packages/score-contracts/index';
import { PracticeTransport } from './transport';

export class Calibration {
  readonly transport = new PracticeTransport(); samples: number[] = []; running = false;
  private used = new Set<number>(); private timer?: number; private subscription?: () => void;
  private operation = 0;
  private hidden = () => {if (document.hidden) this.stop();};
  private lostFocus = () => this.stop();
  onChange: () => void = () => {};
  async start(config: SessionConfig, subscribe: (fn: (event: InputEvent) => void) => () => void): Promise<void> {
    this.stop(); const operation = this.operation; this.samples = []; this.used.clear();
    const beatMs = 60000 / 80, beats = Array.from({length: 12}, (_, i) => ({atMs: i * beatMs, accent: i % 4 === 0}));
    const plan = {config: {...config, mode: 'bpm', bpm: 80, countIn: 4, metronome: true}, beats} as Plan;
    await this.transport.start(plan); if (operation !== this.operation) return; this.running = true;
    window.addEventListener('blur', this.lostFocus); document.addEventListener('visibilitychange', this.hidden);
    this.subscription = subscribe(e => {
      if (e.type !== 'on' || e.deviceId !== config.deviceId || e.source !== config.inputSource) return;
      if (e.receivedMs - e.atMs > config.deliveryMs || e.atMs - e.receivedMs > 10) return;
      const at = this.transport.relative(e.atMs), index = Math.round(at / beatMs), expected = index * beatMs;
      if (index < 0 || index >= 12 || Math.abs(at - expected) > 350 || this.used.has(index)) return;
      this.used.add(index); this.samples.push(at - expected); this.onChange();
    });
    this.timer = window.setInterval(() => {this.transport.schedule(); if (this.transport.position() > 12 * beatMs + 400) this.stop();}, 40);
    this.transport.onSuspend = () => this.stop(); this.onChange();
  }
  get median(): number | null {const sorted = [...this.samples].sort((a, b) => a - b); return sorted.length >= 8 ? Math.round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2) : null;}
  get spread(): number | null {if (this.median === null) return null; const errors = this.samples.map(s => Math.abs(s - this.median!)).sort((a, b) => a - b); return Math.round(errors[Math.ceil(errors.length * .9) - 1]);}
  stop(): void {++this.operation; this.running = false; clearInterval(this.timer); this.subscription?.(); this.subscription = undefined; this.transport.stop();
    window.removeEventListener('blur', this.lostFocus); document.removeEventListener('visibilitychange', this.hidden); this.onChange();}
  dispose(): void {this.stop(); void this.transport.context?.close();}
}
