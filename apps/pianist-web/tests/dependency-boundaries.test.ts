import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { inspectSource } = require('../../../buildscripts/pianist/check-dependencies.cjs');
const root = path.resolve(import.meta.dirname, '../../..');
const errors = (file: string, source: string) =>
  inspectSource(path.join(root, file), source, root).failures as string[];

test('boundary checker catches imports, reexports, import types and worker asset bypasses', () => {
  for (const source of [
    `import { ManiaHitWindows } from '../../../packages/practice-engine-v2/upstream/mania';`,
    `export { x } from '../../../packages/score-formats/abc';`,
    `type X = import('../../../packages/practice-engine-v2/model').Timeline;`,
    `const lazy = () => import('../../../packages/practice-engine-v2/engine');`,
    `const w = new Worker(new URL('../../../packages/practice-worker-v2/worker.ts', import.meta.url));`,
  ])
    assert(
      errors('apps/pianist-web/src/test.ts', source).some((error) =>
        error.includes('public index'),
      ),
      source,
    );
});

test('domain packages cannot reach UI/I/O while local internals and public types remain legal', () => {
  assert(
    errors(
      'packages/practice-engine-v2/test.ts',
      `import {x} from '../../apps/pianist-web/src/workspace';`,
    ).length,
  );
  assert(errors('packages/score-contracts/test.ts', `import React from 'react';`).length);
  assert(
    errors('packages/practice-engine-v2/test.ts', `export const load = () => fetch('/score');`)
      .length,
  );
  assert(
    errors(
      'packages/practice-engine-v2/test.ts',
      `export const load = () => globalThis.fetch('/score');`,
    ).length,
  );
  assert(errors('packages/score-contracts/test.ts', `const db = globalThis['indexedDB'];`).length);
  assert(
    errors(
      'packages/practice-engine-v2/test.ts',
      `const {fetch: request} = globalThis; export const load = () => request('/x');`,
    ).length,
  );
  assert(errors('packages/score-contracts/test.ts', `const {indexedDB: database} = self;`).length);
  assert(
    errors(
      'packages/score-contracts/test.ts',
      `let database; ({['indexedDB']: database} = globalThis);`,
    ).length,
  );
  assert.deepEqual(
    errors(
      'packages/practice-engine-v2/test.ts',
      `import {x} from './upstream/mania'; import type {ScoreSnapshot} from '../score-contracts';`,
    ),
    [],
  );
  assert.deepEqual(
    errors(
      'apps/pianist-web/src/test.ts',
      `import type {Timeline} from '../../../packages/practice-engine-v2'; // import '../private'
const message = "import './not-code'";`,
    ),
    [],
  );
});
