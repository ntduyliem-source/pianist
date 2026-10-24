import { useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
export type LibraryViewMode = 'list' | 'small' | 'large';
export function useLibraryView() {
  const [view, setView] = useState<LibraryViewMode>(() => {
    try {
      const stored = localStorage.getItem('pianist.library-view');
      if (stored === 'list' || stored === 'small' || stored === 'large') return stored;
    } catch {}
    return matchMedia('(max-width: 650px)').matches ? 'list' : 'small';
  });
  return [
    view,
    (next: LibraryViewMode) => {
      setView(next);
      try {
        localStorage.setItem('pianist.library-view', next);
      } catch {}
    },
  ] as const;
}
export function LibraryViewSwitch({
  view,
  onChange,
}: {
  view: LibraryViewMode;
  onChange: (view: LibraryViewMode) => void;
}) {
  return (
    <div className="library-view-switch" role="group" aria-label="Kiểu xem thư viện">
      {(
        [
          ['list', 'list', 'Danh sách'],
          ['small', 'grid', 'Ảnh nhỏ'],
          ['large', 'tile', 'Ảnh lớn'],
        ] as const
      ).map(([id, icon, label]) => (
        <button
          key={id}
          aria-label={label}
          aria-pressed={view === id}
          title={label}
          onClick={() => onChange(id)}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
