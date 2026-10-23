import type { EngineBridge } from '../../../../packages/engine-bridge';

/** Native retains the editor project/undo stack; serialized bytes are emergency download only. */
export class GradeAudioLoan {
  private bridge?: EngineBridge;
  private generation = 0;
  private backup?: Uint8Array;
  get active(): boolean {
    return !!this.bridge;
  }
  get editorBackup(): Uint8Array | undefined {
    return this.backup;
  }

  async borrow(
    bridge: EngineBridge,
    bytes: Uint8Array,
    signal: AbortSignal,
    hasEditor: boolean,
  ): Promise<EngineBridge> {
    signal.throwIfAborted();
    if (this.bridge && this.bridge !== bridge) throw Error('Engine nghe đã thay đổi.');
    bridge.setPractice(true);
    const prior = this.bridge;
    if (!prior) this.backup = hasEditor ? bridge.serialize() : undefined;
    const generation = ++this.generation;
    this.bridge = bridge;
    try {
      if (!bridge.api.loadPracticeScore?.(bytes, 'exercise.mxl'))
        throw Error('MuseScore chưa mở được bài nghe.');
    } catch (error) {
      this.bridge = prior;
      if (!prior) this.backup = undefined;
      throw error;
    }
    const check = () => {
      signal.throwIfAborted();
      if (generation !== this.generation || this.bridge !== bridge)
        throw new DOMException('Đã đổi bài nghe.', 'AbortError');
    };
    const deadline = performance.now() + 20000;
    while (!bridge.auditionState().available) {
      check();
      if (performance.now() > deadline)
        throw Error('MuseScore chưa sẵn sàng phát bài. Bấm Nghe để thử lại.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    check();
    return bridge;
  }

  restore(expected: EngineBridge | undefined): boolean {
    if (!expected || this.bridge !== expected) return false;
    expected.audition('reset');
    if (!expected.api.restorePracticeScore?.())
      throw Error('Chưa phục hồi được editor. Bản tự lưu vẫn còn trong thư viện.');
    this.generation++;
    this.bridge = undefined;
    this.backup = undefined;
    return true;
  }
}
