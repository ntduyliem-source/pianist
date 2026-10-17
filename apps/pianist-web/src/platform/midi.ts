import type { InputEvent } from '../../../../packages/score-contracts/index';
type Port = {id: string; name: string; state: string; onmidimessage: ((e: {data: Uint8Array; timeStamp: number}) => void) | null; open(): Promise<unknown>; close(): Promise<unknown>};
export const noteName = (pitch: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
export class MidiRouter {
  private access: any; private selected?: Port; private sequence = 0; private held = new Map<string, InputEvent>();
  private blocked = new Set<string>(); private pedals = new Set<string>();
  private observers = new Set<(event: InputEvent) => void>();
  subscribe = (listener: (event: InputEvent) => void) => {this.observers.add(listener); return () => this.observers.delete(listener);};
  ports: {id: string; name: string}[] = []; deviceId = 'virtual'; pedal = false;
  onInput: (e: InputEvent, bytes: number[]) => void = () => {};
  onChange: () => void = () => {}; onDisconnect: () => void = () => {};
  onReset: () => void = () => {};
  async connect(autoSelect = true): Promise<void> {
    const nav = navigator as Navigator & {requestMIDIAccess?: (options: {sysex: boolean}) => Promise<unknown>};
    if (!isSecureContext || !nav.requestMIDIAccess) throw Error('Web MIDI cần Chrome/Edge qua HTTPS hoặc localhost. Có thể dùng bàn phím ảo để thử.');
    try { this.access ??= await nav.requestMIDIAccess({sysex: false}); }
    catch {throw Error('Chưa được cấp quyền MIDI. Cho phép MIDI trong cài đặt của trang rồi bấm Kết nối lại.');}
    this.access.onstatechange = () => this.refresh(); this.refresh();
    if (autoSelect && this.ports.length === 1) await this.select(this.ports[0].id);
    if (!this.ports.length) throw Error('Chưa tìm thấy đàn MIDI. Cắm USB/MIDI rồi bấm Kết nối lại.');
  }
  private refresh(): void {
    this.ports = [...this.access.inputs.values()].filter((p: Port) => p.state === 'connected').map((p: Port) => ({id: p.id, name: p.name || 'MIDI keyboard'}));
    if (this.selected && !this.ports.some(p => p.id === this.selected!.id)) {
      this.release(); this.blocked.clear(); this.selected.onmidimessage = null; this.selected = undefined; this.deviceId = 'virtual'; this.onDisconnect();
    }
    this.onChange();
  }
  async select(id: string): Promise<void> {
    if (id === this.deviceId && (!this.selected || this.selected.state === 'connected')) return;
    this.release();
    this.blocked.clear();
    if (this.selected) {this.selected.onmidimessage = null; await this.selected.close();}
    this.selected = undefined; this.deviceId = 'virtual';
    if (id !== 'virtual') {
      const port = this.access?.inputs.get(id) as Port | undefined;
      if (!port || port.state !== 'connected') throw Error('Thiết bị đã ngắt kết nối.');
      await port.open(); this.selected = port; this.deviceId = port.id;
      port.onmidimessage = e => this.receive([...e.data], e.timeStamp, port.id, 'midi');
    }
    this.onChange();
  }
  receive(bytes: number[], timestamp: number, deviceId = 'virtual', source: InputEvent['source'] = 'virtual', synthetic = false): void {
    if (bytes.length < 3) return;
    if (source === 'midi' && deviceId !== this.deviceId || source === 'virtual' && this.deviceId !== 'virtual') return;
    const [status, pitch, velocity] = bytes, op = status >> 4;
    if (![status, pitch, velocity].every(Number.isInteger) || !Number.isFinite(timestamp) || ![8, 9, 11].includes(op) || pitch < 0 || pitch > 127 || velocity < 0 || velocity > 127) return;
    if (op === 11 && ![64, 120, 123].includes(pitch)) return;
    const receivedMs = performance.now();
    // Some legacy implementations expose epoch timestamps. Preserve the input receipt time.
    const atMs = timestamp > 1e12 ? timestamp - performance.timeOrigin : timestamp;
    const type = op === 11 ? 'pedal' : op === 8 || velocity === 0 ? 'off' : 'on';
    const e: InputEvent = {seq: ++this.sequence, epoch: 0, type, pitch, velocity, channel: status & 15, deviceId, source, atMs, receivedMs, ...(synthetic ? {synthetic: true} : {})};
    const key = `${deviceId}/${e.channel}/${pitch}`;
    if (type === 'off') this.blocked.delete(key);
    if (type === 'on' && this.blocked.has(key)) return;
    if (type === 'on') {if (this.held.has(key)) return; this.held.set(key, e);}
    if (type === 'off') this.held.delete(key);
    if (type === 'pedal' && pitch === 64) {
      const channel = `${deviceId}/${e.channel}`;
      if (velocity >= 64) this.pedals.add(channel); else this.pedals.delete(channel);
      this.pedal = this.pedals.size > 0;
    }
    if (type === 'pedal' && pitch !== 64) {this.release(e.channel); this.onReset(); return;}
    this.onInput(e, type === 'off' ? [0x80 | e.channel, pitch, velocity] : bytes); this.onChange();
    this.observers.forEach(fn => fn(e));
  }
  virtual(pitch: number, on: boolean): void {this.receive([on ? 0x90 : 0x80, pitch, on ? 90 : 0], performance.now());}
  release(channel?: number): void {
    for (const e of [...this.held.values()].filter(e => channel === undefined || e.channel === channel)) {
      this.receive([0x80 | e.channel, e.pitch, 0], performance.now(), e.deviceId, e.source, true);
      // A focus/session boundary releases app voices, but the physical key must
      // actually come up before another Note On can receive credit.
      if (e.source === 'midi') this.blocked.add(`${e.deviceId}/${e.channel}/${e.pitch}`);
    }
    for (const key of [...this.pedals]) {
      const split = key.lastIndexOf('/'), device = key.slice(0, split), ch = +key.slice(split + 1);
      if (channel === undefined || channel === ch) this.receive([0xb0 | ch, 64, 0], performance.now(), device, device === 'virtual' ? 'virtual' : 'midi', true);
    }
    this.onChange();
  }
  heldPitches(): number[] {return [...new Set([...this.held.values()].map(e => e.pitch))];}
}
