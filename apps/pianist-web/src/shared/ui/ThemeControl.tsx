import { useSyncExternalStore } from 'react';
import {
  themeSnapshot,
  subscribeTheme,
  setTheme,
  type ThemePreference,
} from '../../platform/theme';
export function ThemeControl() {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot);
  return (
    <label className="theme-control">
      <span aria-hidden="true">{theme.mode === 'dark' ? '☾' : '☀'}</span>
      <select
        aria-label="Giao diện sáng tối"
        value={theme.preference}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
      >
        <option value="system">Hệ thống</option>
        <option value="light">Sáng</option>
        <option value="dark">Tối</option>
      </select>
    </label>
  );
}
