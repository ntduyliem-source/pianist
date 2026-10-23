// Presentation adapter. All positions come from MuseScore's audio clock;
// the browser's output timestamp selects the PCM block currently being heard.
export class NativePlaybackClock {
    epoch = -1;
    frames = [];
    observe(binding) {
        this.epoch = binding.epoch;
        this.frames = [];
    }
    receive({binding, frames}) {
        if (binding.epoch !== this.epoch) return;
        this.frames.push(...frames.map(frame => ({...frame, epoch: binding.epoch,
            tempoMultiplier: binding.tempoMultiplier, sequenceId: binding.sequenceId})));
        const cutoff = this.frames.at(-1).contextTime - 3;
        let first = 0;
        while (first < this.frames.length && this.frames[first].contextTime < cutoff) first++;
        if (first) this.frames.splice(0, first);
    }
    read(context, epoch, now = performance.now()) {
        if (epoch !== this.epoch || !context || context.state !== 'running') return null;
        const stamp = context.getOutputTimestamp?.();
        const outputTime = stamp?.contextTime > 0 && stamp?.performanceTime > 0
            ? stamp.contextTime + Math.max(0, now - stamp.performanceTime) / 1000
            : context.currentTime - (context.baseLatency || 0) - (context.outputLatency || 0);
        let lo = 0, hi = this.frames.length;
        while (lo < hi) {const mid = (lo + hi) >>> 1;if (this.frames[mid].contextTime <= outputTime) lo = mid + 1;else hi = mid;}
        // In particular, never show the first note before its output block and
        // never extrapolate across a seek, pause, repeat or suspended context.
        const frame = this.frames[lo - 1];
        return frame ? {...frame, outputContextTime: outputTime} : null;
    }
}
