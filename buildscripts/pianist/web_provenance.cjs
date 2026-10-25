// Bind the Vite bundle to its source inputs; copied MuseScore glue is verified separately.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const STAMP = 'web/frontend.json';
const SOURCE_DIRECTORIES = ['apps/pianist-web/src', 'apps/pianist-web/patches', 'packages'];
const SOURCE_FILES = ['apps/pianist-web/package.json', 'apps/pianist-web/package-lock.json',
  'apps/pianist-web/tsconfig.json', 'apps/pianist-web/vite.config.ts',
  'scores/grades/definition.json', 'scores/curriculum/length-buckets.v2.json', 'scores/curriculum/grades.v2.json',
  'third_party/score-format-sources/manifest.json', 'buildscripts/pianist/web_provenance.cjs'];
const REQUIRED_OUTPUTS = ['app/pianist.js', 'app/pianist.css', 'app/exercise-renderer.js', 'app/library-thumbnail.js'];
const GLUE = ['muapi.js', 'muimpl.js', 'qtloader.js', 'audioworker.js', 'audiodriver.js',
  'audio-ready.js', 'native-playback-clock.js', 'audio_worklet_processor.js'];
const STATIC = [
  ...GLUE.map(name => ({ source: 'src/web/appjs/distr/' + name, path: 'distr/' + name })),
  { source: 'src/web/appjs/distr/config.js.in', path: 'distr/config.js', configure: true },
  { source: 'src/web/appjs/viewer/pianist.html', path: 'pianist.html' },
  { source: 'src/web/appjs/viewer/pianist.html', path: 'index.html' },
  { source: 'src/web/appjs/viewer/manifest.webmanifest', path: 'manifest.webmanifest' },
  { source: 'src/web/appjs/viewer/icon.svg', path: 'icon.svg' },
];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const canonicalHash = value => hash(JSON.stringify(value));
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Linked web input/output is not supported: ' + file);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.test-dist', '__pycache__', '.venv'].includes(entry.name)) files.push(...walk(file));
    } else if (entry.isFile() && !/\.py[co]$/.test(entry.name)) files.push(file);
  }
  return files;
}

function sourceInputs(root) {
  const files = new Set(SOURCE_FILES);
  for (const directory of SOURCE_DIRECTORIES)
    for (const file of walk(path.join(root, directory))) files.add(relative(root, file));
  // Vite reads dotenv overrides implicitly. Hash their contents without storing
  // their values; public verification rejects any file absent from the archive.
  for (const entry of fs.readdirSync(path.join(root, 'apps/pianist-web'), { withFileTypes: true }))
    if (entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.')))
      files.add('apps/pianist-web/' + entry.name);
  return [...files].sort().map(name => {
    const file = path.join(root, name);
    if (fs.lstatSync(file).isSymbolicLink()) throw Error('Linked web source: ' + name);
    return { path: name, sha256: hash(fs.readFileSync(file)) };
  });
}

function snapshot(root) {
  const files = sourceInputs(root);
  return { inputSha256: canonicalHash(files), sourceInputCount: files.length };
}

function outputs(directory) {
  const files = walk(path.join(directory, 'app'))
    .filter(file => ['.js', '.css'].includes(path.extname(file)))
    .map(file => {
      const bytes = fs.readFileSync(file);
      return { path: relative(directory, file), bytes: bytes.length, sha256: hash(bytes) };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const required of REQUIRED_OUTPUTS)
    if (!files.some(file => file.path === required)) throw Error('Missing frontend output: ' + required);
  return files;
}

function validateBundleInputs(root, directory) {
  const included = new Set(sourceInputs(root).map(file => file.path));
  const maps = walk(path.join(directory, 'app')).filter(file => file.endsWith('.js.map'));
  if (!maps.length) throw Error('Vite sourcemaps are required to verify bundled source inputs');
  for (const file of maps) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const source of map.sources ?? []) {
      const resolved = path.resolve(path.dirname(file), map.sourceRoot || '', source);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue; // virtual Rolldown module
      const name = relative(root, resolved);
      if (name.split('/').includes('node_modules')) continue; // package-lock + dependency patches
      if (name.startsWith('../') || path.isAbsolute(name) || !included.has(name))
        throw Error('Bundled source is outside the web provenance inputs: ' + name + '. Add its scope before rebuilding.');
    }
  }
}

function begin(root, directory) {
  fs.rmSync(path.join(directory, STAMP), { force: true });
  return { schemaVersion: 1, target: 'web', ...snapshot(root) };
}

function complete(root, directory, before) {
  const current = snapshot(root);
  if (before.schemaVersion !== 1 || before.target !== 'web' || before.inputSha256 !== current.inputSha256)
    throw Error('Frontend inputs changed during build; run npm run build again.');
  const stamp = { schemaVersion: 1, target: 'web', ...current,
    builtAt: new Date().toISOString(),
    sourceCommitAtBuild: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    files: outputs(directory) };
  fs.mkdirSync(path.dirname(path.join(directory, STAMP)), { recursive: true });
  fs.writeFileSync(path.join(directory, STAMP), JSON.stringify(stamp, null, 2));
  return stamp;
}

function installedSources(root, directory) {
  const files = STATIC.map(entry => {
    let expected = fs.readFileSync(path.join(root, entry.source));
    if (entry.configure) expected = Buffer.from(expected.toString('utf8').replaceAll('{{MUSE_MODULE_AUDIO_WORKER}}', 'OFF'));
    const destination = path.join(directory, entry.path);
    if (!fs.existsSync(destination) || !expected.equals(fs.readFileSync(destination)))
      throw Error('Stale installed web source: ' + entry.path + '. Run node src/web/appjs/install.js <directory>.');
    return { path: entry.path, source: entry.source, bytes: expected.length, sha256: hash(expected) };
  });
  const actual = walk(path.join(directory, 'distr')).filter(file => ['.js', '.css'].includes(path.extname(file)))
    .map(file => relative(directory, file)).sort();
  const expected = STATIC.filter(file => file.path.startsWith('distr/')).map(file => file.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected installed MuseScore glue inventory');
  return files;
}

function verify(root, directory, publicSource = false) {
  const proofPath = path.join(directory, STAMP);
  if (!fs.existsSync(proofPath)) throw Error('Missing frontend provenance; run npm run build in apps/pianist-web.');
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  const current = snapshot(root);
  if (proof.schemaVersion !== 1 || proof.target !== 'web' || proof.inputSha256 !== current.inputSha256 || proof.sourceInputCount !== current.sourceInputCount)
    throw Error('Stale frontend inputs; run npm run build in apps/pianist-web before packaging.');
  if (JSON.stringify(proof.files) !== JSON.stringify(outputs(directory)))
    throw Error('Frontend outputs differ from their completed build; run npm run build again.');
  const installed = installedSources(root, directory);
  if (publicSource) {
    const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).split('\0'));
    const sources = [...sourceInputs(root).map(file => file.path), ...installed.map(file => file.source), 'src/web/appjs/install.js'];
    const missing = [...new Set(sources.filter(name => !tracked.has(name)))];
    if (missing.length) throw Error('Web build uses inputs absent from the Git source archive: ' + missing.join(', '));
  }
  return { ...current, installedSourcesSha256: canonicalHash(installed) };
}

function build(root, directory) {
  const before = begin(root, directory), app = path.join(root, 'apps/pianist-web');
  for (const [entry, args] of [['typescript/bin/tsc', ['--noEmit']], ['vite/bin/vite.js', ['build']]]) {
    const result = spawnSync(process.execPath, [path.join(app, 'node_modules', entry), ...args], { cwd: app, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(entry + ' failed; no frontend build stamp was produced.');
  }
  validateBundleInputs(root, directory);
  const proof = complete(root, directory, before);
  console.log('Frontend build proof: ' + proof.inputSha256 + ' (' + proof.files.length + ' outputs)');
}

module.exports = { STAMP, STATIC, SOURCE_FILES, REQUIRED_OUTPUTS, sourceInputs, snapshot, outputs, validateBundleInputs, begin, complete, installedSources, verify, build };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), operation = args.shift();
    let directory = path.join(ROOT, 'build.artifacts'), publicSource = false;
    while (args.length) {
      const arg = args.shift();
      if (arg === '--directory' && args.length) directory = path.resolve(args.shift());
      else if (arg === '--public') publicSource = true;
      else throw Error('Unknown argument: ' + arg);
    }
    if (operation === 'build') {
      if (directory !== path.join(ROOT, 'build.artifacts')) throw Error('Vite build output is fixed by vite.config.ts');
      build(ROOT, directory);
    } else if (operation === 'verify') console.log(JSON.stringify(verify(ROOT, directory, publicSource)));
    else throw Error('Usage: web_provenance.cjs build | verify [--directory <site>] [--public]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
