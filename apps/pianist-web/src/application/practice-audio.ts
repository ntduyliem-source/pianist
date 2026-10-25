import type { EngineBridge } from '../../../../packages/engine-bridge';
import type { NativePracticeAudioProvider } from '../platform/audio-clock-v2';
import { bounded, soundSnapshot, unlockSound } from '../platform/audio-output';
import { practicePiano } from '../platform/sample-piano';

/** Practice and calibration must initialize the same selected audio output. */
export function practiceAudioProvider(
  engine: () => Promise<EngineBridge>,
): NativePracticeAudioProvider {
  return async () => {
    if (soundSnapshot() === 'piano') return practicePiano;
    const bridge = await engine();
    await bounded(
      bridge.api.startAudioProcessing(unlockSound()),
      60000,
      'Chưa tải được tiếng MuseScore. Thử lại.',
    );
    bridge.api.Module.driver?.setMuted?.(false);
    return bridge.practiceAudio();
  };
}
