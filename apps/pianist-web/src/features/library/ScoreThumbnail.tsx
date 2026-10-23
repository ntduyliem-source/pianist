import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LibraryThumbnails } from '../../platform/score-thumbnail';
import type { LibraryTrack } from '../../application/library-player';

const Thumbnails = createContext<LibraryThumbnails | null>(null);
export function ThumbnailProvider({ children }: { children: ReactNode }) {
  const [service] = useState(() => new LibraryThumbnails());
  useEffect(() => () => service.dispose(), [service]);
  return <Thumbnails.Provider value={service}>{children}</Thumbnails.Provider>;
}
export function ScoreThumbnail({ track, url }: { track: LibraryTrack; url?: string }) {
  const service = useContext(Thumbnails),
    element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false),
    [result, setResult] = useState<{ id: string; url: string }>(),
    [error, setError] = useState('');
  const [missing, setMissing] = useState<string>();
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px' },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || (url && missing !== url) || !service) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setError('');
    void trackRef.current
      .load(abort.signal)
      .then((data) => service.render(data.bytes, data.filename, abort.signal))
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ id: track.id, url: objectUrl });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setError(error instanceof Error ? error.message : 'Chưa tạo được preview');
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track.id, visible, url, missing, service]);
  const src = url && missing !== url ? url : result?.id === track.id ? result.url : undefined;
  return (
    <span ref={element} className="score-thumbnail" title={error || undefined}>
      {src ? (
        <img
          src={src}
          alt={'Trang đầu: ' + track.title}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (url && missing !== url) setMissing(url);
            else {
              setResult(undefined);
              setError('Trình duyệt chưa giải mã được ảnh xem trước.');
            }
          }}
        />
      ) : (
        <span className="thumbnail-status">
          {error ? 'Chưa có xem trước' : visible ? 'Đang dựng sheet…' : 'Xem trước sheet'}
        </span>
      )}
    </span>
  );
}
