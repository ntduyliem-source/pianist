/** WebKit's documented media category, shared by native audio and the metronome.
 * https://bugs.webkit.org/show_bug.cgi?id=237322#c6
 * This does not bypass user activation or claim to detect the hardware mute switch.
 */
export interface BrowserAudioSession extends EventTarget {
  type: string;
  state?: string;
}
type AudioNavigator = { audioSession?: BrowserAudioSession };

export function activatePlaybackAudio(nav: AudioNavigator = navigator as AudioNavigator): void {
  try {
    if (nav.audioSession && nav.audioSession.type !== 'playback')
      nav.audioSession.type = 'playback';
  } catch {
    // Other engines and older Safari continue through their normal Web Audio path.
  }
}

export function installAudioSession(onInterrupted: () => void): () => void {
  const activate = () => activatePlaybackAudio();
  const session = (navigator as AudioNavigator).audioSession;
  const changed = () => {
    if (session?.state === 'interrupted') onInterrupted();
  };
  // Capture runs before UI handlers create/resume either AudioContext. Engine
  // loading may finish later; its audio category has already been selected.
  document.addEventListener('pointerdown', activate, true);
  document.addEventListener('keydown', activate, true);
  session?.addEventListener('statechange', changed);
  return () => {
    document.removeEventListener('pointerdown', activate, true);
    document.removeEventListener('keydown', activate, true);
    session?.removeEventListener('statechange', changed);
  };
}
