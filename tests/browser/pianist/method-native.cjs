// Every shipped method lesson goes through the actual independent MuseScore
// renderer. Saved snapshots feed grade-native-library.ts without a fake parser.
const { chromium } = require('playwright');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/method-practice');
const url = process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/practice';
(async () => {
  await fs.mkdir(path.join(out, 'native'), { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), results = [], errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(url);
    const catalog = await page.evaluate(async () => {
      const response = await fetch('methods/catalog.json');
      if (!response.ok) throw Error('Missing methods catalog');
      const { ExerciseRenderer } = await import('./app/exercise-renderer.js');
      window.methodAuditRenderer = new ExerciseRenderer();
      return response.json();
    });
    const lessons = catalog.books.flatMap(book => book.lessons.map(lesson => ({ ...lesson, bookId: book.id, title: book.title + ' · ' + lesson.title })));
    assert(lessons.length, 'No method lessons');
    for (const lesson of lessons) {
      try {
        const data = await page.evaluate(async lesson => {
          const response = await fetch(lesson.file);
          if (!response.ok) throw Error('Could not load lesson');
          const rendered = await window.methodAuditRenderer.prepare(new Uint8Array(await response.arrayBuffer()), lesson.id + '.mxl');
          const s = rendered.snapshot;
          const ink = new Set(s.pages.flatMap(p => [...p.svg.matchAll(/data-practice-notes="([^"]+)"/g)].flatMap(m => m[1].split(' '))));
          return {
            sourceHash: rendered.sourceHash,
            snapshot: { ...s, pages: s.pages.map(({ svg, ...p }) => ({ ...p, svg: '' })) },
            missingInk: s.anchors.filter(n => n.visible && !ink.has(n.id.replace(/^m\d+-/, ''))).map(n => n.id),
            missingSpans: s.performance?.events.filter(n => !n.spans.length).length,
            counts: { staves: s.staves.length, anchors: s.anchors.length, events: s.performance?.events.length, pages: s.pages.length },
          };
        }, lesson);
        assert.equal(data.sourceHash, lesson.sha256);
        assert.equal(data.counts.staves, 2);
        assert(data.counts.events > 0 && data.counts.pages > 0);
        assert.deepEqual(data.missingInk, []);
        assert.equal(data.missingSpans, 0);
        const id = lesson.bookId + '--' + lesson.id;
        assert(/^[a-z0-9-]+$/.test(id));
        await fs.writeFile(path.join(out, 'native', id + '.json'), JSON.stringify({ ...data.snapshot, projectId: id, fingerprint: lesson.sha256 }));
        results.push({ id, title: lesson.title, passed: true, ...data.counts });
        console.log(`${results.length}/${lessons.length} ${lesson.title}: ${data.counts.events} native attacks`);
      } catch (error) {
        results.push({ id: lesson.bookId + '--' + lesson.id, title: lesson.title, passed: false, error: String(error) });
        console.error('FAIL', lesson.title, String(error));
      }
      await fs.writeFile(path.join(out, 'native-audit.json'), JSON.stringify({ passed: results.length === lessons.length && results.every(r => r.passed), expected: lessons.length, results, errors }, null, 2));
    }
    assert(results.every(r => r.passed), 'Some method scores failed native audit');
    assert.deepEqual(errors, []);
  } finally {
    await page.evaluate(() => window.methodAuditRenderer?.dispose()).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
