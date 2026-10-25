const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/editor-playback-owner');
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  const report = { checks: [], tempos: [], errors: [] };
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('dialog', d => d.type() === 'beforeunload' ? d.accept() : d.dismiss());
  await page.addInitScript(() => {
    window.editorMeters = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args);
      if (args[0] === this.context.destination && !this.editorMeter) {
        const meter = this.editorMeter = this.context.createAnalyser(); meter.fftSize = 2048;
        connect.call(this, meter); window.editorMeters.push(meter);
      }
      return result;
    };
    window.editorPeak = () => Math.max(0, ...window.editorMeters.map(m => {
      const a = new Float32Array(m.fftSize); m.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs));
    }));
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#diagnostics{display:none!important}'; document.head.append(s); });
  });
  const controls = page.getByRole('region', { name: 'Phát bản nhạc trong editor' });
  const play = () => controls.getByRole('button', { name: 'Phát nhạc', exact: true }).click();
  const playing = () => controls.getByRole('button', { name: 'Tạm dừng phát nhạc', exact: true }).waitFor({ timeout: 150000 });
  const stop = () => controls.getByRole('button', { name: 'Dừng phát nhạc', exact: true }).click();
  const check = message => { report.checks.push(message); console.log('PASS', message); };
  try {
    await page.goto(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library');
    await page.locator('#file').setInputFiles(path.join(root, 'tests/fixtures/pianist/m0/piano.mxl'));
    await controls.waitFor({ timeout: 150000 });
    await page.waitForFunction(() => window.pianist && typeof window.pianist.Module.onEditorPlaybackCommand === 'function' && !document.querySelector('.loading-overlay'), null, { timeout: 150000 });
    await page.evaluate(() => {
      window.editorCursors = []; window.editorSamples = [];
      const api = window.pianist, cursor = api.sampleEditorPosition, sample = api.getSamplePlayback;
      api.sampleEditorPosition = (seconds, sounding) => { window.editorCursors.push({ seconds, sounding }); return cursor(seconds, sounding); };
      api.getSamplePlayback = speed => {
        const callback = api.Module.onSamplePlayback;
        api.Module.onSamplePlayback = json => { window.editorSamples.push({ speed, data: JSON.parse(json) }); callback(json); };
        try { return sample(speed); } finally { api.Module.onSamplePlayback = callback; }
      };
    });
    for (const speed of [.1, .5, 1, 2, 3]) {
      await page.evaluate(speed => window.pianist.editorPlayback('tempo', speed), speed);
      await play(); await playing();
      await page.waitForFunction(() => window.editorPeak() > 0.0001, null, { timeout: 30000 });
      const max = +(await controls.getByRole('slider').getAttribute('max'));
      const sample = await page.evaluate(() => window.editorSamples.at(-1));
      assert.equal(sample.speed, speed);
      assert(Math.abs(max - sample.data.timeMap.at(-1).playbackMs / 1000) < .001);
      assert(Math.abs(sample.data.timeMap.at(-1).referenceMs - 6000) < .01);
      const notes = sample.data.midi.filter(e => e.opcode === 9 && e.data2 > 0);
      assert(notes.some(e => e.atMs > sample.data.timeMap.at(-1).playbackMs * .8), 'last native attacks remain inside the full range');
      await controls.getByRole('button', { name: 'Tạm dừng phát nhạc', exact: true }).click();
      const seek = max - .7;
      await page.evaluate(seconds => window.pianist.Module.onEditorPlaybackCommand('seek', seconds), seek);
      await page.waitForFunction(seconds => Math.abs(+document.querySelector('.editor-playback input[type=range]').value - seconds) < .03, seek);
      const cursor = await page.evaluate(() => window.editorCursors.at(-1));
      assert(Math.abs(cursor.seconds - seek) < .03, 'native cursor receives performed seconds, not reference seconds');
      await play(); await playing();
      await controls.getByRole('button', { name: 'Phát nhạc', exact: true }).waitFor({ timeout: 7000 });
      assert(Math.abs(+(await controls.getByRole('slider').inputValue()) - max) < .03);
      report.tempos.push({ speed, duration: max, noteAttacks: notes.length, lastAttackMs: notes.at(-1).atMs });
      await stop();
    }
    check('10/50/100/200/300 percent: full native MIDI, duration, seek, cursor and natural end share one time map');
    await page.evaluate(() => window.pianist.editorPlayback('tempo', .5));
    await play(); await playing();
    // Actual MuseScore Qt toolbar at the fixed desktop viewport, not the React button.
    await page.screenshot({ path: path.join(out, 'before-qt-pause.png') });
    await page.mouse.click(1172, 206);
    await controls.getByText('Đã tạm dừng', { exact: true }).waitFor();
    const paused = +(await controls.getByRole('slider').inputValue());
    await page.waitForTimeout(450);
    assert(Math.abs(+(await controls.getByRole('slider').inputValue()) - paused) < .02);
    await page.waitForFunction(() => window.editorPeak() < .00001, null, { timeout: 10000 });
    await page.mouse.click(1172, 206); await playing();
    await page.waitForFunction(() => window.editorPeak() > .0001, null, { timeout: 10000 });
    check('The actual Qt Pause/Play toolbar controls light-piano audio and its shared position');
    await page.getByRole('button', { name: 'Tập piano', exact: true }).click();
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Tiếng MuseScore', exact: true }).check();
    await play(); await playing();
    await page.waitForFunction(() => window.editorPeak() > .0001, null, { timeout: 30000 });
    await page.waitForFunction(() => +document.querySelector('.editor-playback input[type=range]').value > .5);
    await stop();
    check('Leaving a playing sample editor for practice, returning and switching to MuseScore produces advancing audio');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) {
    report.passed = false; report.error = String(error.stack); console.error(report.error);
    await page.screenshot({ path: path.join(out, 'failure.png') }); process.exitCode = 1;
  } finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})();
