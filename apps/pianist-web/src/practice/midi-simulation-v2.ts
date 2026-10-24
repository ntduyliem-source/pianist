import type { PracticeController } from './controller-v2';
import type { MidiRouter } from '../platform/midi-v2';
// Explicit diagnostics-only MIDI producer. It never calls a matcher or writes
// judgements: all bytes enter the same router/controller/Worker as a keyboard.
export function simulateMidi(
  controller: PracticeController,
  router: MidiRouter,
  deltaMs: number,
  releaseReference = false,
) {
  if (router.deviceId !== 'virtual') throw Error('Chọn bàn phím ảo trước khi mô phỏng.');
  // Separate score voices can overlap on one piano key. The virtual device
  // must release that key before striking it again, just like physical MIDI.
  const nextAttack = new Map<number, number>();
  const releaseAt = new Map<string, number>();
  for (const n of [...controller.timeline.targets].reverse()) {
    releaseAt.set(
      n.id,
      Math.min(
        releaseReference ? (n.releaseMs ?? n.endMs) : n.atMs + deltaMs + 20,
        nextAttack.get(n.pitch) ?? Infinity,
      ),
    );
    nextAttack.set(n.pitch, n.atMs + deltaMs);
  }
  const events = controller.timeline.targets.flatMap((n) => [
    { at: n.atMs + deltaMs + controller.timeline.settings.offsetMs, bytes: [0x90, n.pitch, 90] },
    {
      at: releaseAt.get(n.id)! + controller.timeline.settings.offsetMs,
      bytes: [0x80, n.pitch, 0],
    },
  ]);
  if (releaseReference && controller.timeline.settings.pedalEnabled !== false)
    for (const p of controller.timeline.pedals ?? [])
      events.push(
        { at: p.atMs + controller.timeline.settings.offsetMs, bytes: [0xb0, 64, 127] },
        { at: p.endMs + controller.timeline.settings.offsetMs, bytes: [0xb0, 64, 0] },
      );
  events.sort((a, b) => a.at - b.at || a.bytes[0] - b.bytes[0]);
  let next = 0;
  const timer = window.setInterval(() => {
    if (!['counting', 'running'].includes(controller.status)) {
      clearInterval(timer);
      return;
    }
    const at = controller.transport.now;
    while (next < events.length && events[next].at <= at) {
      const e = events[next++];
      router.receive(e.bytes, controller.transport.performanceAt(e.at));
    }
    if (next === events.length) clearInterval(timer);
  }, 10);
  return () => clearInterval(timer);
}
