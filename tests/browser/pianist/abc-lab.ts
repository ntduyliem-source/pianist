import {ScoreFormatClient} from '../../../packages/score-formats/client';
import type {FormatJob} from '../../../packages/score-formats/model';
const client = new ScoreFormatClient({baseUrl: new URL('../score-formats/', location.href).href});
(window as any).abcLab = {run: (job: FormatJob) => client.run(job), cancel: () => client.cancel(),
  runWithTimeout: (job: FormatJob, timeoutMs: number) => {
    const other = new ScoreFormatClient({baseUrl: new URL('../score-formats/', location.href).href, conversionTimeoutMs: timeoutMs});
    return other.run(job).finally(() => other.dispose());
  }};
document.getElementById('status')!.textContent = 'ABC converter lab ready';
