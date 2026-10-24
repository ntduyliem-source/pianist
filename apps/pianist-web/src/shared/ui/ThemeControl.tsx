import { useSyncExternalStore } from 'react';
import { themeSnapshot, subscribeTheme, setTheme } from '../../platform/theme';
import { Icon } from './Icon';
export function ThemeControl() {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot);
  return (
    <button
      className="icon-button theme-toggle"
      title={theme.mode === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
      aria-label={theme.mode === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
      onClick={() => setTheme(theme.mode === 'dark' ? 'light' : 'dark')}
    >
      <Icon name={theme.mode === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
