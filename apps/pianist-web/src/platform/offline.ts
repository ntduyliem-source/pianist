export function offlineBytes(release: { files: { bytes: number }[] }): number {
  if (
    !Array.isArray(release.files) ||
    release.files.some((f) => !Number.isSafeInteger(f.bytes) || f.bytes < 0)
  )
    throw Error('Manifest offline không hợp lệ.');
  return release.files.reduce((sum, file) => sum + file.bytes, 0);
}
function installed(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
    };
    const changed = () => {
      if (['installed', 'activated'].includes(worker.state)) {
        done();
        resolve();
      } else if (worker.state === 'redundant') {
        done();
        reject(
          Error(
            'Không cài được bộ offline. Kiểm tra mạng, dung lượng hoặc hash tài nguyên rồi thử lại.',
          ),
        );
      }
    };
    const timer = setTimeout(() => {
      done();
      reject(Error('Chuẩn bị offline quá thời gian. Kết nối lại rồi thử lại.'));
    }, 180000);
    worker.addEventListener('statechange', changed);
    changed();
  });
}
function verify(worker: ServiceWorker): Promise<{ version: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel(),
      timer = setTimeout(() => {
        channel.port1.close();
        reject(Error('Không kiểm tra được bộ offline. Hãy thử lại.'));
      }, 180000);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      channel.port1.close();
      if (data.ok) resolve(data);
      else reject(Error(data.message));
    };
    worker.postMessage({ type: 'offline-verify' }, [channel.port2]);
  });
}
let pending: Promise<void> | undefined;
export function prepareOffline(progress: (message: string) => void): Promise<void> {
  if (pending) return pending;
  pending = prepare(progress).finally(() => {
    pending = undefined;
  });
  return pending;
}
async function prepare(progress: (message: string) => void): Promise<void> {
  if (!('serviceWorker' in navigator)) throw Error('Trình duyệt này chưa hỗ trợ offline.');
  const script = new URL('sw.js', location.href).href;
  let detail = '';
  const listener = (event: MessageEvent) => {
    if ((event.source as ServiceWorker | null)?.scriptURL !== script) return;
    const d = event.data;
    if (d.type === 'offline-progress')
      progress(`Đang kiểm tra và lưu offline ${d.done}/${d.total} tài nguyên…`);
    if (d.type === 'offline-error') {
      detail = d.message;
      progress('Chưa lưu offline: ' + detail);
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  try {
    const response = await fetch('release.json');
    if (!response.ok) throw Error('Chưa có manifest offline.');
    const bytes = offlineBytes(await response.json());
    progress(`Đang chuẩn bị ${Math.ceil(bytes / 1024 ** 2)} MiB, gồm editor và bộ đọc/xuất ABC…`);
    // The worker computes required free space from missing manifest entries.
    const registration = await navigator.serviceWorker.register('sw.js', {
      scope: './',
      updateViaCache: 'none',
    });
    if (!registration.installing)
      await registration.update().catch((error) => {
        if (!registration.active && !registration.waiting) throw error;
      });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) throw Error('Không tìm thấy bộ cài offline.');
    await installed(worker);
    const verified = await verify(worker);
    const mib = Math.ceil(verified.bytes / 1024 ** 2);
    progress(
      registration.waiting
        ? 'Bản offline mới đã sẵn sàng (' +
            mib +
            ' MiB). Đóng tất cả tab Pianist rồi mở lại để dùng bản mới.'
        : `Đã kiểm tra bộ offline ${mib} MiB, gồm ABC. Đóng rồi mở lại Pianist để sử dụng.`,
    );
  } catch (error) {
    throw Error(detail || String(error instanceof Error ? error.message : error));
  } finally {
    navigator.serviceWorker.removeEventListener('message', listener);
  }
}
export async function useOnline(): Promise<void> {
  if (pending) throw Error('Chờ chuẩn bị offline hoàn tất trước khi chuyển sang online.');
  const script = new URL('sw.js', location.href).href;
  const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
  for (const registration of registrations) {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    if (worker?.scriptURL === script) await registration.unregister();
  }
  // unregister() does not detach the worker from already open tabs. They still
  // need its pinned executable and lesson caches until they are closed. Leave
  // both caches intact; a later worker activation can collect unused releases.
}
