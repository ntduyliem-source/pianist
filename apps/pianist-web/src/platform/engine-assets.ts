interface Release {
  version: string;
  files: { path: string; bytes: number; sha256: string }[];
}
export async function checkedAsset(
  path: string,
  release: Release,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const expected = release.files.find((f) => f.path === path);
  if (!expected)
    throw Error('Bản phát hành thiếu tài nguyên MuseScore. Hãy hoàn tất build rồi tải lại trang.');
  const response = await fetcher(path);
  if (!response.ok) throw Error('Không tải được ' + path);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  if (bytes.length !== expected.bytes || hash !== expected.sha256)
    throw Error(
      'Bộ MuseScore đang được cập nhật hoặc tải chưa đủ. Chờ build hoàn tất rồi tải lại trang; thư viện vẫn được giữ.',
    );
  return bytes;
}
export async function loadEngineAssets(): Promise<Uint8Array> {
  const response = await fetch('release.json');
  if (!response.ok) throw Error('Chưa có bản đóng gói hoàn chỉnh. Chạy build-pianist rồi mở lại.');
  const release = (await response.json()) as Release;
  // Verify the pair before executing either half. A dev build or an incomplete
  // deployment must never instantiate old glue against a newly written WASM.
  const [script, wasm] = await Promise.all([
    checkedAsset('MuseScoreStudio.js', release),
    checkedAsset('MuseScoreStudio.wasm', release),
  ]);
  const url = URL.createObjectURL(
    new Blob([script.buffer as ArrayBuffer], { type: 'text/javascript' }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const element = document.createElement('script');
      element.src = url;
      element.onload = () => {
        element.remove();
        resolve();
      };
      element.onerror = () => {
        element.remove();
        reject(Error('Không khởi tạo được MuseScore.'));
      };
      document.head.append(element);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  return wasm;
}
