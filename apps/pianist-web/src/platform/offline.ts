export async function prepareOffline(progress: (message: string) => void): Promise<void> {
  if (!('serviceWorker' in navigator)) throw Error('Trình duyệt này chưa hỗ trợ offline.');
  const estimate = await navigator.storage?.estimate();
  if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < 250 * 1024 ** 2) throw Error('Cần khoảng 250 MiB bộ nhớ trình duyệt trống để chuẩn bị offline.');
  const listener = (event: MessageEvent) => {
    const d = event.data;
    if (d.type === 'offline-progress') progress(`Đang lưu offline ${d.done}/${d.total} tài nguyên…`);
    if (d.type === 'offline-error') progress('Chưa lưu offline: ' + d.message);
    if (d.type === 'offline-ready') progress('Đã lưu bộ tài nguyên offline. Đóng rồi mở lại Pianist để sử dụng.');
  };
  navigator.serviceWorker.addEventListener('message', listener);
  progress('Đang chuẩn bị offline · khoảng 180 MiB…');
  const registration = await navigator.serviceWorker.register('sw.js', {scope: './', updateViaCache: 'none'});
  if (registration.active && !registration.installing && !registration.waiting) progress('Bộ offline đã sẵn sàng. Mỗi phiên giữ nguyên một phiên bản ứng dụng.');
  if (registration.waiting) progress('Bản offline mới đã sẵn sàng. Đóng tất cả tab Pianist rồi mở lại để dùng bản mới.');
  // Keep listener alive for the installation, bounded to avoid accumulating subscriptions.
  setTimeout(() => navigator.serviceWorker.removeEventListener('message', listener), 10 * 60 * 1000);
}
export async function useOnline(): Promise<void> {
  const script = new URL('sw.js', location.href).href;
  const registrations = await navigator.serviceWorker?.getRegistrations() ?? [];
  for (const registration of registrations) {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    if (worker?.scriptURL === script) await registration.unregister();
  }
  for (const key of await caches.keys()) if (key.startsWith('pianist-release-')) await caches.delete(key);
}
