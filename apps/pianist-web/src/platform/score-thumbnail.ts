import { ExerciseRenderer } from '../../../../packages/exercise-renderer';
import type { ScorePage } from '../../../../packages/score-contracts';

export async function rasterizePage(page: ScorePage): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([page.svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = Math.max(1, Math.round((480 * page.height) / page.width));
    if (canvas.height > 4096) throw Error('Trang nhạc quá dài để tạo ảnh xem trước.');
    const context = canvas.getContext('2d');
    if (!context) throw Error('Không tạo được ảnh xem trước.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error('Không lưu được ảnh xem trước.'))),
        'image/webp',
        0.86,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Serial, separate native renderer. A thumbnail never loads into the editor. */
export class LibraryThumbnails {
  private renderer?: ExerciseRenderer;
  private queue: Promise<unknown> = Promise.resolve();
  private version?: Promise<string>;
  private closed = false;
  async render(bytes: Uint8Array, filename: string, signal: AbortSignal): Promise<Blob> {
    signal.throwIfAborted();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    const version = await (this.version ??= fetch('release.json')
      .then(async (response) => {
        if (!response.ok) throw Error('Không tải được thông tin renderer.');
        const release = await response.json();
        const hash = release.files?.find(
          (entry: { path: string }) => entry.path === 'renderer/PianistRenderer.wasm',
        )?.sha256;
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
          throw Error('Thiếu phiên bản renderer.');
        return hash as string;
      })
      .catch((error) => {
        this.version = undefined;
        throw error;
      }));
    const key = new URL(`thumbnail-cache/v1/${version}/${hash}.webp`, location.href).href;
    const cache = await (typeof caches === 'undefined'
      ? Promise.resolve(undefined)
      : caches.open('pianist-score-thumbnails-v1').catch(() => undefined));
    const existing = await cache?.match(key).catch(() => undefined);
    signal.throwIfAborted();
    if (existing) return existing.blob();
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        signal.throwIfAborted();
        if (this.closed) throw new DOMException('Đã đóng thư viện.', 'AbortError');
        const { snapshot } = await (this.renderer ??= new ExerciseRenderer()).prepare(
          bytes,
          filename,
          signal,
        );
        signal.throwIfAborted();
        if (!snapshot.pages[0]) throw Error('Bản nhạc chưa có trang xem trước.');
        const blob = await rasterizePage(snapshot.pages[0]);
        signal.throwIfAborted();
        try {
          await cache?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
          const keys = await cache?.keys();
          for (const old of keys?.slice(0, Math.max(0, keys.length - 200)) ?? [])
            await cache?.delete(old);
        } catch {
          /* Derived cache is optional when device storage is full. */
        }
        return blob;
      });
    this.queue = task.catch(() => {});
    return task;
  }
  dispose() {
    this.closed = true;
    this.renderer?.dispose();
  }
}
