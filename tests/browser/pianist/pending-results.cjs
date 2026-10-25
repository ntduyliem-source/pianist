// Failed IndexedDB writes must leave an exportable result after the practice screen unmounts.
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/pending-results');
const url = process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/practice';
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage(), report = { checks: [], errors: [] };
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.addInitScript(() => {
    window.rejectSessionWrites = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.rejectSessionWrites && this.name === 'sessions') throw new DOMException('Simulated quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style'); s.textContent = '#diagnostics{display:none!important}'; document.head.append(s);
    });
  });
  const check = label => { report.checks.push(label); console.log('PASS', label); };
  try {
    await page.goto(url);
    await page.getByRole('group', { name: 'Cách tập piano' }).getByRole('button', { name: 'Theo giáo trình', exact: true }).click();
    await page.getByRole('combobox', { name: 'Giáo trình', exact: true }).selectOption('hanon-part-1');
    await page.getByRole('combobox', { name: 'Bài tập', exact: true }).selectOption('hanon-part-1-001');
    await page.getByRole('button', { name: 'Mở bài giáo trình', exact: true }).click();
    await page.locator('svg.practice-system-svg').first().waitFor({ timeout: 150000 });
    await page.getByRole('button', { name: 'Chọn đoạn', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Từ ô nhịp', exact: true }).fill('1');
    await page.getByRole('spinbutton', { name: 'Đến ô nhịp', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await page.getByRole('button', { name: 'Thiết lập', exact: true }).click();
    await page.getByRole('combobox', { name: 'Chế độ tập', exact: true }).selectOption('bpm');
    await page.getByRole('combobox', { name: 'Tempo', exact: true }).selectOption('score');
    const countIn = page.getByRole('spinbutton', { name: 'Đếm vào', exact: true });
    await countIn.fill('0'); await countIn.press('Tab');
    await page.getByRole('button', { name: 'MIDI mô phỏng trường độ + pedal', exact: true }).click();
    const banner = page.getByRole('complementary', { name: 'Kết quả chưa lưu' });
    await banner.waitFor({ timeout: 90000 });
    assert.match(await banner.innerText(), /Bộ nhớ trình duyệt đã đầy/);
    assert.match(await page.locator('.method-result').innerText(), /Chưa lưu kết quả/);
    check('A completed method attempt explicitly reports the failed write');
    await page.evaluate(() => { location.hash = '#/library'; });
    await page.getByRole('heading', { name: 'Thư viện', exact: true }).waitFor();
    assert(await banner.isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const name of ['Lưu lại', 'Tải JSON']) {
      const button = banner.getByRole('button', { name, exact: true });
      assert(await button.isVisible());
      const box = await button.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
    }
    await page.screenshot({ path: path.join(out, 'pending-mobile.png') });
    const downloaded = page.waitForEvent('download');
    await banner.getByRole('button', { name: 'Tải JSON', exact: true }).click();
    const file = path.join(out, 'retained-attempt.json'); await (await downloaded).saveAs(file);
    const result = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(result.projectId, 'method:hanon-part-1:hanon-part-1-001');
    assert(result.judgements.length > 0 && result.timeline.targets.length > 0);
    check('Pending result survives navigation; its real score, timeline and judgements download as JSON on mobile');
    let unloadSeen = false;
    page.once('dialog', async dialog => { assert.equal(dialog.type(), 'beforeunload'); unloadSeen = true; await dialog.dismiss(); });
    await page.reload({ timeout: 5000 }).catch(() => {});
    assert(unloadSeen); assert(await banner.isVisible());
    check('Reload warns before abandoning the only retained result');
    await page.evaluate(() => { window.rejectSessionWrites = false; });
    await banner.getByRole('button', { name: 'Lưu lại', exact: true }).click();
    await banner.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Lịch sử tập', exact: true }).click();
    await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Về giáo trình', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Tập lại', exact: true }).click();
    await page.getByTestId('method-progress').waitFor({ timeout: 150000 });
    assert.equal(await page.getByTestId('method-progress').getAttribute('data-lesson-id'), 'hanon-part-1-001');
    check('Retry persists once, removes the warning, and history resumes the original method lesson');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) {
    report.passed = false; report.error = String(error.stack || error); process.exitCode = 1;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  } finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
