import type { EngineBridge } from '../../../../packages/engine-bridge';
import { soundSnapshot } from '../platform/audio-output';
import { NativeAudition, type AuditionRange, type Audition } from './native-audition';
import { SampleAudition } from './sample-audition';
export function createAudition(bridge: EngineBridge, range: AuditionRange): Audition {
  return soundSnapshot() === 'musescore'
    ? new NativeAudition(bridge, range)
    : new SampleAudition(bridge, range);
}
