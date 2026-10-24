const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/sample-preview');
(async () => {
 await fs.mkdir(out, { recursive: true });
 const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
 const report = { checks: [], errors: [], levels: [] };
 await page.addInitScript(() => {
  addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='#diagnostics{display:none!important}';document.head.appendChild(style);});
  window.meters = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(...args) {
   const result = connect.apply(this, args);
   if (args[0] === this.context.destination && !this.meter) {
    const meter = this.meter = this.context.createAnalyser(); meter.fftSize = 2048; connect.call(this, meter); window.meters.push(meter);
   }
   return result;
  };
  window.peak = () => Math.max(0, ...window.meters.map(m => { const a = new Float32Array(m.fftSize); m.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs)); }));
 });
 page.on('pageerror', e => report.errors.push(String(e)));
 page.on('dialog', d => d.type() === 'beforeunload' ? d.accept() : d.dismiss());
 const top = name => page.getByRole('group', { name: 'Điều khiển tập luyện' }).getByRole('button', { name, exact: true });
 const level = async (name, delay) => { await page.waitForTimeout(delay); const peak = await page.evaluate(() => window.peak()); report.levels.push({ name, peak }); return peak; };
 const silence = () => page.waitForFunction(() => window.peak() < 1e-5, null, { timeout: 10000 });
 const key = name => page.getByRole('group', { name: 'Piano 88 phím A0–C8' }).getByRole('button', { name, exact: true });
 const down = async name => { const el = key(name); await el.scrollIntoViewIfNeeded(); const box = await el.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height - 5); await page.mouse.down(); };
 const check = message => { report.checks.push(message); console.log('PASS', message); };
 try {
  await page.goto(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library');
  await page.locator('#file').setInputFiles(path.join(root, 'tests/fixtures/pianist/m0/piano.mxl'));
  await page.getByRole('region', { name: 'Phát bản nhạc trong editor' }).waitFor({ timeout: 120000 });
  await page.locator('.loading-overlay').waitFor({ state: 'hidden', timeout: 120000 });
  await page.getByRole('button', { name: 'Tập bài này', exact: true }).click();
  await page.getByTestId('practice-v2').waitFor(); await top('Thiết lập').click();
  await page.getByRole('spinbutton', { name: 'Đếm vào', exact: true }).fill('0');
  await page.getByRole('checkbox', { name: 'Metronome', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Hiện bàn phím hỗ trợ', exact: true }).check();
  await page.getByRole('button', { name: 'Đóng thiết lập', exact: true }).click();
  await page.getByRole('button', { name: 'Đúng nốt', exact: true }).click(); await top('Bắt đầu tập').click();
  await page.waitForFunction(() => document.querySelector('.v2-status')?.textContent === 'Đang tập', null, { timeout: 60000 });
  for (const note of ['A0', 'C4', 'C8']) { await down(note); assert(await level(note, 80) > 1e-6); await page.mouse.up(); await silence(); }
  check('Virtual A0, C4 and C8 generate actual sample PCM through the practice provider');
  await down('C4'); await page.waitForTimeout(150); await page.mouse.up(); const released = await level('released', 650); await silence();
  await page.locator('.v2-feedback-panel summary').click();
  const pedal = page.getByRole('button', { name: 'Đạp hoặc nhả pedal ảo', exact: true });
  await pedal.click(); await down('C4'); await page.waitForTimeout(150); await page.mouse.up(); const held = await level('pedal down', 650);
  assert(held > 1e-5 && held > released * 3); await pedal.click(); const lifted = await level('pedal up', 1000); assert(lifted < held / 3); await silence();
  check('Upstream Piano CC64 sustains a released virtual key and releases it when the pedal lifts');
  await top('Dừng lượt tập').click(); await silence();
  await page.getByRole('button', { name: 'Theo BPM', exact: true }).click(); await top('Thiết lập').click();
  await page.getByRole('combobox', { name: 'Tay tập', exact: true }).selectOption('right');
  await page.getByRole('checkbox', { name: 'Phát tay còn lại khi tập BPM', exact: true }).check();
  await page.getByRole('button', { name: 'Đóng thiết lập', exact: true }).click();
  await top('Bắt đầu tập').click(); await page.waitForFunction(() => document.querySelector('.v2-status')?.textContent === 'Đang tập');
  assert(await level('left hand guide', 150) > 1e-5); await top('Dừng lượt tập').click(); await silence(); assert(await level('cancelled guide events', 1000) < 1e-5);
  check('Channel-15 guide sounds without pressing a key; Stop cancels scheduled guide events');
  assert.deepEqual(report.errors, []); report.passed = true;
 } catch (error) { report.passed = false; report.error = String(error.stack); console.error(report.error); await page.screenshot({ path: path.join(out, 'failure.png') }); process.exitCode = 1; }
 finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})();
