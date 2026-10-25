// Start calibration before any audition/practice session, using each real audio output.
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/calibration-cold');
const url = process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/practice';
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const report = { checks: [], errors: [] };
  try {
    for (const sound of ['piano', 'musescore']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)));
      await page.addInitScript(() => {
        window.calibrationMeters = []; window.calibrationLoads = []; window.calibrationViews = []; window.calibrationTerminated = 0;
        const NativeWorker = Worker;
        window.Worker = class extends NativeWorker {
          constructor(...args) { super(...args); this.addEventListener('message', ({ data }) => { if (data?.view) window.calibrationViews.push(data); }); }
          postMessage(data, ...args) { if (data?.type === 'load' && data.timeline?.projectId === 'calibration') { this.isCalibration = true; window.calibrationLoads.push(data); } return super.postMessage(data, ...args); }
          terminate() { if (this.isCalibration) window.calibrationTerminated++; return super.terminate(); }
        };
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (...args) {
          const result = connect.apply(this, args);
          if (args[0] === this.context.destination && !this.calibrationMeter) {
            const meter = this.calibrationMeter = this.context.createAnalyser(); meter.fftSize = 2048;
            connect.call(this, meter); window.calibrationMeters.push(meter);
          }
          return result;
        };
        window.calibrationPeak = () => Math.max(0, ...window.calibrationMeters.map(meter => {
          const values = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(values); return Math.max(...values.map(Math.abs));
        }));
        addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style'); style.textContent = '#diagnostics{display:none!important}'; document.head.append(style);
        });
      });
      try {
        await page.goto(url);
        await page.getByRole('group', { name: 'Cách tập piano' }).getByRole('button', { name: 'Theo giáo trình', exact: true }).click();
        await page.getByRole('combobox', { name: 'Giáo trình', exact: true }).selectOption('hanon-part-1');
        await page.getByRole('button', { name: 'Mở bài giáo trình', exact: true }).click();
        await page.locator('svg.practice-system-svg').first().waitFor({ timeout: 150000 });
        assert.equal(await page.evaluate(() => !!window.pianist), false, 'opening a method must not require the editor before calibration');
        await page.getByRole('button', { name: 'Thiết lập', exact: true }).click();
        if (sound === 'musescore') await page.getByRole('checkbox', { name: 'Tiếng MuseScore', exact: true }).check();
        await page.getByRole('button', { name: 'Đo bù trễ bằng 12 phách…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Đo bù trễ MIDI', exact: true });
        await dialog.getByRole('button', { name: 'Bắt đầu đo', exact: true }).click();
        await page.waitForFunction(() => window.calibrationLoads.length === 1, null, { timeout: 150000 });
        await page.waitForFunction(() => window.calibrationPeak() > 0.0001, null, { timeout: 30000 });
        await page.waitForFunction(() => window.calibrationViews.some(reply => reply.view.judgements?.length), null, { timeout: 30000 });
        assert(!/Error|không|chưa/i.test(await dialog.locator('[role=status]').innerText()));
        if (sound === 'piano') assert.equal(await page.evaluate(() => !!window.pianist), false, 'default piano calibration stays independent of the editor engine');
        await page.screenshot({ path: path.join(out, sound + '.png') });
        await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => window.calibrationTerminated === 1);
        report.checks.push(sound + ': fresh method screen starts real audible calibration and the production Worker advances; closing cancels it');
        console.log('PASS', report.checks.at(-1));
      } catch (error) {
        await page.screenshot({ path: path.join(out, sound + '-failure.png') }).catch(() => {}); throw error;
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) { report.passed = false; report.error = String(error.stack || error); process.exitCode = 1; }
  finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
