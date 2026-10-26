// Font regressions must compare native glyph paths, not just note counts or a
// browser font-family string. The fixture is our CC0 composition, not user data.
const {chromium} = require('playwright');
const {unzipSync, zipSync, strFromU8, strToU8} = require('../../../apps/pianist-web/node_modules/fflate');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash}=require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/native-fonts');
const base = new URL(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html');
const paths = s => s.pages.map(p => p.svg.replace(/<title>.*?<\/title>/gs, ''));
const outlineHash = s => createHash('sha256').update(JSON.stringify(paths(s))).digest('hex');
(async () => {
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const page = await browser.newPage({serviceWorkers:'block'}), report = {checks:[], errors:[]};
  page.on('pageerror', e => report.errors.push(String(e)));
  try {
    await page.route('**/__font_acceptance__', r => r.fulfill({contentType:'text/html', body:'<!doctype html><title>Font acceptance</title>'}));
    await page.goto(new URL('__font_acceptance__', base).href);
    await page.evaluate(async () => {const {ExerciseRenderer}=await import('./app/exercise-renderer.js');window.renderer=new ExerciseRenderer();});
    const render = async (data, id, filename='font-fixture.musicxml') => {
      const bytes = typeof data==='string' ? Buffer.from(data) : data;
      const s = await page.evaluate(async ({bytes,filename}) => (await window.renderer.prepare(Uint8Array.from(bytes),filename)).snapshot, {bytes:[...bytes],filename});
      await fs.writeFile(path.join(out, id+'.svg'), s.pages[0].svg);
      assert.equal(s.staves.length, 2);assert(s.performance.events.length > 0);
      return s;
    };
    const original = await fs.readFile(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'),'utf8');
    const fixture = (family, style='') => original.replace('<part-list>',
      `<defaults><word-font font-family="${family}"/></defaults><credit page="1"><credit-type>title</credit-type><credit-words font-family="${family}" font-size="22" ${style} default-x="600" default-y="1500" justify="center" valign="top">Tình đầu quá chén · Nhắc Mi rồi Rê · 0123456789</credit-words></credit><part-list>`);
    for (const [name, style] of [['regular',''], ['bold-italic','font-weight="bold" font-style="italic"']]) {
      const reference = await render(fixture('FreeSerif',style), 'reference-'+name);
      for (const family of ['Calibri','Times New Roman','Times','Courier New','PianistMissingFont']) {
        const actual = await render(fixture(family,style), family.replaceAll(' ','-')+'-'+name);
        assert.equal(outlineHash(actual),outlineHash(reference),family+' must use the same outlines AND layout as the bundled fallback');
        assert.deepEqual(actual.performance,reference.performance,'font changes cannot change native playback');
        report.checks.push(family+' '+name+': exact FreeSerif glyph/layout and playback parity');
      }
    }
    // Existing saved MSCZ uses family + inline <font face>, not MusicXML
    // font-family. Exercise the native load path without a JS XML normalizer.
    const native = await fs.readFile(path.join(root,'src/engraving/tests/playback/playbackeventsrenderer_data/single_note_no_articulations/no_articulations.mscx'),'utf8');
    const mscz = family => zipSync({
      'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>'),
      'score.mscx':strToU8(native.replace('<Measure>',`<VBox><height>12</height><Text><style>title</style><family>${family}</family><text><font face="${family}"/>Tình đầu quá chén 299</text></Text></VBox><Measure>`)),
    });
    assert(native.includes('<Measure>'),'Native fixture must contain its first measure');
    const savedReference=await render(mscz('FreeSerif'),'saved-reference','saved.mscz');
    const savedLegacy=await render(mscz('Calibri'),'saved-legacy','saved.mscz');
    assert.equal(outlineHash(savedLegacy),outlineHash(savedReference),'Existing MSCZ must render correctly without rewriting saved bytes');
    assert.deepEqual(savedLegacy.performance,savedReference.performance);
    report.checks.push('Existing MSCZ family/inline face uses identical bundled outlines and playback without changing its source');
    const mixed = fixture('FreeSerif').replace('Tình đầu quá chén · Nhắc Mi rồi Rê · 0123456789','我不後悔 · Nhắc Mi rồi Rê');
    const mixedReference=await render(mixed,'mixed-cjk-reference');
    const mixedUnknown=await render(mixed.replaceAll('font-family="FreeSerif"','font-family="Arial"'),'mixed-cjk-unknown');
    assert.equal(outlineHash(mixedUnknown),outlineHash(mixedReference),'Unknown family must retain the bundled CJK fallback');
    const decomposed=await render(fixture('FreeSerif').normalize('NFD'),'vietnamese-decomposed');
    const composed=await render(fixture('FreeSerif'),'vietnamese-composed');
    assert.equal(outlineHash(decomposed),outlineHash(composed),'Vietnamese combining accents must shape like their NFC equivalent');
    report.checks.push('Mixed CJK/Vietnamese fallback and composed/decomposed Vietnamese preserve correct glyph paths');
    // Real source scores which visibly failed in the production audit. Replace
    // only the unbundled families in the reference; keep every note/credit intact.
    const catalog = JSON.parse(await fs.readFile(path.join(root,'scores/methods/catalog.json'),'utf8'));
    for (const id of ['czerny-op-599','czerny-op-299','duvernoy-op-176']) {
      const lesson = catalog.books.find(b=>b.id===id).lessons[0];
      const data = await fs.readFile(path.join(root,'scores',lesson.file));
      const entries = unzipSync(data), container = strFromU8(entries['META-INF/container.xml']);
      const filename = /full-path="([^"]+)"/.exec(container)[1], xml = strFromU8(entries[filename]);
      const actual = await render(xml,id), reference = await render(xml.replace(/font-family="(?:Times New Roman|Times)"/g,'font-family="FreeSerif"'),id+'-reference');
      assert.equal(outlineHash(actual),outlineHash(reference),id+' must equal the corrected source rendering');
      assert.deepEqual(actual.performance,reference.performance);
      report.checks.push(id+': exact native glyph and playback parity with font-only reference');
    }
    assert.deepEqual(report.errors,[]);report.passed=true;
  } catch(e) {report.error=String(e.stack);process.exitCode=1;console.error(report.error);}
  finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report));
})();
