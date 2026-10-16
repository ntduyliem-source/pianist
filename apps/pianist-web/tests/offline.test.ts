import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('offline worker serves its own release manifest, even if a new server release is deployed', async () => {
  const source = readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js', import.meta.url), 'utf8');
  const listeners: Record<string, (event: any) => void> = {};
  const release = {version: 'pinned-old', files: []};
  runInNewContext(source.replace('__PIANIST_RELEASE__', JSON.stringify(release)), {
    URL, Response, self: {location: {href: 'https://example.test/pianist/sw.js'}, addEventListener: (name: string, handler: any) => listeners[name] = handler},
  });
  let response!: Response;
  listeners.fetch({request: {method: 'GET', url: 'https://example.test/pianist/release.json'}, respondWith: (value: Response) => response = value});
  assert.deepEqual(await response.json(), release);
});
