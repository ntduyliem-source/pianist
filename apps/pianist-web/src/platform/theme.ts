export type ThemePreference = 'system' | 'light' | 'dark';
type ThemeState = { preference: ThemePreference; mode: 'light' | 'dark' };
let state: ThemeState = { preference: 'system', mode: 'light' };
const listeners = new Set<() => void>();
export const themeSnapshot = () => state;
export const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setTheme(preference: ThemePreference) {
  const mode =
    preference === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  state = { preference, mode };
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#090c14' : '#f8fafc');
  try {
    localStorage.setItem('pianist.theme', preference);
  } catch {}
  listeners.forEach((listener) => listener());
}
export function initializeTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('pianist.theme');
  } catch {}
  setTheme(saved === 'light' || saved === 'dark' ? saved : 'system');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.preference === 'system') setTheme('system');
  });
}
