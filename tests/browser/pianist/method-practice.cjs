// User flows through the shipped selector, MuseScore renderer, playback and MIDI Worker.
const { chromium } = require('playwright');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/method-practice');
const url = process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/practice';
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage(), report = { url, checks: [], errors: [] };
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('dialog', d => d.type() === 'beforeunload' ? d.accept() : d.dismiss());
  await context.addInitScript(() => {
    window.methodLoads = []; window.methodReplies = []; window.methodRenders = []; window.methodMeters = [];
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(...args) { super(...args); this.addEventListener('message', ({ data }) => {
        if (data?.view) window.methodReplies.push({ generation: data.generation, view: data.view });
        if (data?.type === 'result' && data.result?.snapshot) window.methodRenders.push(data.result.snapshot);
      }); }
      postMessage(data, ...args) { if (data?.type === 'load' && data.timeline) window.methodLoads.push(data); return super.postMessage(data, ...args); }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args);
      if (args[0] === this.context.destination && !this.methodMeter) {
        const meter = this.methodMeter = this.context.createAnalyser(); meter.fftSize = 2048;
        connect.call(this, meter); window.methodMeters.push(meter);
      }
      return result;
    };
    window.methodAudioPeak = () => Math.max(0, ...window.methodMeters.map(m => {
      const a = new Float32Array(m.fftSize); m.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs));
    }));
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#diagnostics{display:none!important}'; document.head.append(s); });
  });
  const check = s => { report.checks.push(s); console.log('PASS', s); };
  const mode = name => page.getByRole('group', { name: 'Cách tập piano' }).getByRole('button', { name, exact: true });
  const progress = () => page.getByTestId('method-progress');
  const ready = async () => {
    await progress().waitFor({ timeout: 150000 });
    await page.locator('svg.practice-system-svg').first().waitFor({ timeout: 90000 });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Bài trong giáo trình đang tập"]')?.disabled);
    assert.deepEqual(await page.locator('.v2-alert').allTextContents(), []);
  };
  const number = async (name, value) => { const field = page.getByRole('spinbutton', { name, exact: true }); await field.fill(String(value)); await field.press('Tab'); };
  const openSettings = () => page.getByRole('button', { name: 'Thiết lập', exact: true }).click();
  const back = async () => { await page.getByRole('button', { name: 'Chọn giáo trình và bài', exact: true }).click(); await page.getByRole('combobox', { name: 'Giáo trình', exact: true }).waitFor(); };
  try {
    await page.goto(url);
    await mode('Theo giáo trình').click();
    const bookSelect = page.getByRole('combobox', { name: 'Giáo trình', exact: true });
    await bookSelect.waitFor();
    const catalog = await page.evaluate(async () => (await fetch('methods/catalog.json')).json());
    assert.equal(await bookSelect.locator('option').count(), catalog.books.length);
    const hanon = catalog.books.find(b => /hanon/i.test(b.id));
    assert(hanon?.lessons.length >= 20);
    await bookSelect.selectOption(hanon.id);
    await page.getByRole('searchbox', { name: 'Tìm bài trong giáo trình' }).fill('bai 1');
    assert(await page.locator('#method-lesson option:not([disabled])').count() > 0);
    await page.getByRole('searchbox', { name: 'Tìm bài trong giáo trình' }).fill('');
    await page.getByRole('combobox', { name: 'Bài tập', exact: true }).selectOption(hanon.lessons[0].id);
    check('Three practice modes; method selection uses actual catalog and accent-insensitive search');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `chooser overflow ${width}`);
      for (const name of ['Free play', 'Theo grade', 'Theo giáo trình']) {
        const box = await mode(name).boundingBox(); assert(box.width > 60 && box.height >= 32 && box.x >= 0 && box.x + box.width <= width);
      }
      await page.screenshot({ path: path.join(out, `methods-chooser-${width}.png`) });
    }
    check('Chooser and three-way navigation fit 320/390/768/1440px');
    await page.getByRole('button', { name: 'Mở bài giáo trình', exact: true }).click(); await ready();
    assert.equal(await progress().getAttribute('data-lesson-id'), hanon.lessons[0].id);
    assert.equal(await page.evaluate(() => window.methodRenders.at(-1).staves.length), 2);
    await page.getByRole('button', { name: 'Bài giáo trình tiếp theo', exact: true }).click(); await ready();
    assert.equal(await progress().getAttribute('data-lesson-id'), hanon.lessons[1].id);
    await back(); await page.reload(); await bookSelect.waitFor();
    assert.equal(await bookSelect.inputValue(), hanon.id);
    assert.equal(await page.locator('#method-lesson').inputValue(), hanon.lessons[1].id);
    check('Original two-staff lesson order and last lesson persist after reload');
    await page.getByRole('button', { name: 'Mở bài giáo trình', exact: true }).click(); await ready();
    await page.getByRole('button', { name: 'Bài giáo trình trước', exact: true }).click(); await ready();
    assert.equal(await progress().getAttribute('data-lesson-id'), hanon.lessons[0].id);
    await page.getByRole('button', { name: 'Nghe đoạn', exact: true }).click();
    await page.getByRole('button', { name: 'Tạm dừng nghe', exact: true }).waitFor({ timeout: 150000 });
    await page.waitForFunction(() => window.methodAudioPeak() > 0.0001, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Tạm dừng nghe', exact: true }).click();
    await page.getByRole('button', { name: 'Tiếp tục nghe', exact: true }).click();
    await page.getByRole('button', { name: 'Dừng nghe', exact: true }).click();
    await page.getByRole('button', { name: 'Nghe đoạn', exact: true }).waitFor();
    check('First-play audio produces sound, pause/resume and Stop work on the same method lesson');
    const museSound = page.getByRole('checkbox', { name: 'Tiếng MuseScore', exact: true });
    await openSettings();
    await museSound.check();
    await page.getByRole('button', { name: 'Đóng thiết lập', exact: true }).click();
    await page.getByRole('button', { name: 'Nghe đoạn', exact: true }).click();
    await page.getByRole('button', { name: 'Tạm dừng nghe', exact: true }).waitFor({ timeout: 150000 });
    await page.waitForFunction(() => window.methodAudioPeak() > 0.0001, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Dừng nghe', exact: true }).click();
    await page.getByRole('button', { name: 'Nghe đoạn', exact: true }).waitFor();
    await openSettings();
    await museSound.uncheck();
    await page.getByRole('button', { name: 'Đóng thiết lập', exact: true }).click();
    check('MuseScore sound also plays the method lesson and stops without leaving the screen');
    await page.getByRole('button', { name: 'Chọn đoạn', exact: true }).click();
    await number('Từ ô nhịp', 1); await number('Đến ô nhịp', 1);
    await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await openSettings();
    await page.getByRole('combobox', { name: 'Chế độ tập', exact: true }).selectOption('bpm');
    await page.getByRole('combobox', { name: 'Tempo', exact: true }).selectOption('score');
    await number('Số vòng', 2); await number('Đếm vào', 0);
    await page.getByRole('button', { name: 'MIDI mô phỏng trường độ + pedal', exact: true }).click();
    await page.waitForFunction(() => window.methodLoads.length > 0);
    const load = await page.evaluate(() => window.methodLoads.at(-1));
    assert(load.timeline.targets.some(t => t.loop === 1));
    assert(load.timeline.targets.some(t => t.roles.includes('right')) && load.timeline.targets.some(t => t.roles.includes('left')));
    assert(await page.getByRole('button', { name: 'Bài giáo trình tiếp theo', exact: true }).isDisabled());
    await page.waitForFunction(g => window.methodReplies.some(r => r.generation === g && r.view.done), load.generation, { timeout: 60000 });
    const judgements = await page.evaluate(g => window.methodReplies.filter(r => r.generation === g).flatMap(r => r.view.judgements), load.generation);
    assert.equal(judgements.length, load.timeline.targets.length);
    assert(judgements.every(j => j.grade === 'perfect'));
    assert.equal(await progress().getAttribute('data-lesson-id'), hanon.lessons[0].id);
    check('Native BPM MIDI simulation grades both hands through two A–B loops; no automatic lesson skipping');
    await page.evaluate(() => { location.hash = '#/history'; });
    await page.getByRole('button', { name: 'Xem kết quả', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Về Editor', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Tập lại', exact: true }).click(); await ready();
    assert.equal(await progress().getAttribute('data-lesson-id'), hanon.lessons[0].id);
    await openSettings();
    assert.equal(await page.getByRole('spinbutton', { name: 'Số vòng', exact: true }).inputValue(), '2');
    await page.getByRole('button', { name: 'Đóng thiết lập', exact: true }).click();
    check('History reopens the original method lesson and attempt settings without a library project');
    await page.getByRole('button', { name: 'Chỉ bản nhạc', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.getByRole('button', { name: 'Nghe đoạn', exact: true }).isVisible());
    const pedal = page.getByRole('switch', { name: 'Dùng pedal khi tập', exact: true });
    if (await pedal.getAttribute('aria-checked') === 'true') await pedal.click();
    assert.equal(await pedal.getAttribute('aria-checked'), 'false');
    await page.screenshot({ path: path.join(out, 'methods-full-sheet-mobile.png') });
    await page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }).click();
    await back();
    check('Full sheet keeps listen and pedal controls available on mobile');
    // Delay a real lesson fetch; cancel and switch modes before its late response.
    let releaseFetch, requestReached;
    const gate = new Promise(resolve => { releaseFetch = resolve; });
    const reached = new Promise(resolve => { requestReached = resolve; });
    const target = new URL(hanon.lessons[0].file, url).href;
    await page.route(target, async route => { requestReached(); await gate; await route.continue().catch(() => {}); });
    await page.getByRole('button', { name: 'Mở bài giáo trình', exact: true }).click();
    let timer;
    try { await Promise.race([reached, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Lesson fetch did not start')), 15000); })]); }
    finally { clearTimeout(timer); }
    await page.getByRole('button', { name: 'Hủy mở bài', exact: true }).click();
    await mode('Free play').click(); releaseFetch(); await page.unroute(target);
    await page.waitForTimeout(500);
    assert.equal(await progress().count(), 0); assert.equal(await mode('Free play').getAttribute('aria-pressed'), 'true');
    check('Cancelling a pending score and switching mode ignores late fetch/render callbacks');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) {
    report.passed = false; report.error = String(error.stack || error); process.exitCode = 1;
    await page.screenshot({ path: path.join(out, 'method-ui-failure.png') }).catch(() => {});
  } finally {
    await fs.writeFile(path.join(out, 'ui-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
