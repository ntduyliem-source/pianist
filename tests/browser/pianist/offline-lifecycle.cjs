// Run the shipped offline client and worker against a small, isolated hashed release.
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const http = require('node:http'), crypto = require('node:crypto'), { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/offline-lifecycle');
(async () => {
  await fs.mkdir(out, { recursive: true });
  const template = await fs.readFile(path.join(root, 'src/web/appjs/viewer/sw-template.js'), 'utf8');
  const client = stripTypeScriptTypes(await fs.readFile(path.join(root, 'apps/pianist-web/src/platform/offline.ts'), 'utf8'));
  let version = 1;
  const data = v => ({ 'pianist.html': '<!doctype html><title>Offline lifecycle</title><body>Controlled client</body>', 'asset.txt': 'release ' + v, 'methods/lesson.mxl': 'lesson ' + v });
  const release = v => ({ version: 'lifecycle-' + v, files: Object.entries(data(v)).map(([name, bytes]) => ({
    path: name, bytes: Buffer.byteLength(bytes), sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    ...(name.startsWith('methods/') ? { cache: 'lazy' } : {}),
  })) });
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);
    const content = name === 'sw.js' ? template.replace('__PIANIST_RELEASE__', JSON.stringify(release(version)))
      : name === 'offline.js' ? client : name === 'release.json' ? JSON.stringify(release(version)) : data(version)[name];
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/plain');
    response.setHeader('Cache-Control', 'no-store'); response.statusCode = content === undefined ? 404 : 200; response.end(content || 'missing');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext(), report = { checks: [], errors: [] };
  const page = await context.newPage();
  const check = label => { report.checks.push(label); console.log('PASS', label); };
  const inspect = page => page.evaluate(async () => ({
    version: (await (await fetch('release.json')).json()).version,
    asset: await (await fetch('asset.txt')).text(),
    lesson: await (await fetch('methods/lesson.mxl')).text(),
    cacheKeys: await caches.keys(), controlled: !!navigator.serviceWorker.controller,
  }));
  try {
    await page.goto(base + 'pianist.html');
    await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const other = await context.newPage(); await other.goto(base + 'pianist.html');
    for (const tab of [page, other]) {
      const before = await inspect(tab); assert.equal(before.version, 'lifecycle-1'); assert.equal(before.lesson, 'lesson 1');
    }
    await page.evaluate(async () => { await (await import('./offline.js')).useOnline(); });
    for (const tab of [page, other]) {
      const state = await inspect(tab); assert.equal(state.asset, 'release 1'); assert.equal(state.lesson, 'lesson 1'); assert(state.controlled);
    }
    check('Unregister keeps eager and lazy files available to both tabs still controlled by the old worker');
    version = 2;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('sw.js');
      await registration.update();
    });
    const waitForVersion = async v => {
      const deadline = Date.now() + 30000;
      while (true) {
        for (const worker of context.serviceWorkers())
          if (await worker.evaluate(v => RELEASE.version === v && !!(self.registration.waiting || self.registration.active?.state === 'activated'), v).catch(() => false)) return;
        assert(Date.now() < deadline, 'new release must install');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    await waitForVersion('lifecycle-2');
    const fresh = await context.newPage(); await fresh.goto(base + 'pianist.html');
    const freshState = await inspect(fresh);
    assert(['lifecycle-1', 'lifecycle-2'].includes(freshState.version));
    assert.equal(freshState.asset, freshState.version === 'lifecycle-1' ? 'release 1' : 'release 2');
    for (const tab of [page, other]) {
      const state = await inspect(tab); assert.equal(state.version, 'lifecycle-1'); assert.equal(state.asset, 'release 1'); assert.equal(state.lesson, 'lesson 1');
      assert(state.cacheKeys.some(key => key.includes('lifecycle-1') && key.endsWith('-exercises')));
    }
    check('Re-registering version 2 preserves both old tabs and keeps each client on one pinned release');
    version = 3;
    await fresh.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await waitForVersion('lifecycle-3');
    await page.close(); await other.close(); await fresh.close();
    const deadline = Date.now() + 30000;
    while (true) {
      let activated = false;
      for (const worker of context.serviceWorkers()) {
        if (await worker.evaluate(() => RELEASE.version === 'lifecycle-3' && self.registration.active?.state === 'activated').catch(() => false)) activated = true;
      }
      if (activated) break;
      assert(Date.now() < deadline, 'third worker must activate once all clients close');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const final = await context.newPage(); await final.goto(base + 'pianist.html');
    const state = await inspect(final); assert.equal(state.asset, 'release 3');
    assert(state.cacheKeys.every(key => !key.includes('lifecycle-1') && !key.includes('lifecycle-2')));
    check('A later activation with no live clients reclaims both old eager and lazy caches');
    report.passed = true;
  } catch (error) {
    report.passed = false; report.error = String(error.stack || error); process.exitCode = 1;
  } finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
