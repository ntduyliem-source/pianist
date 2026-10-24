import { useSyncExternalStore } from 'react';
import { workspace as ws } from '../workspace';
import { Icon } from '../shared/ui/Icon';

/** One set of actions, presented as desktop tabs or a mobile bottom bar. */
export function AppNavigation({ mobile = false }: { mobile?: boolean }) {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot);
  useSyncExternalStore(ws.sessions.subscribeStatus, ws.sessions.statusSnapshot);
  const active = !!ws.session && !['ready', 'finished'].includes(ws.session.status);
  return (
    <nav
      className={mobile ? 'mobile-navigation' : 'desktop-navigation'}
      aria-label="Chức năng chính"
    >
      {[
        { id: 'library', icon: 'folder', label: 'Thư viện', action: () => ws.navigate('library') },
        { id: 'practice', icon: 'piano', label: 'Tập piano', action: () => ws.openPractice() },
        { id: 'editor', icon: 'score', label: 'Editor', action: () => ws.openEditor() },
      ].map(({ id, icon, label, action }) => (
        <button
          key={id}
          className={state.view === id ? 'selected' : ''}
          aria-current={state.view === id ? 'page' : undefined}
          disabled={active && state.view !== id}
          onClick={() => void ws.run(action)}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
