"""Create an immutable offline manifest after the engine and web shell builds."""
from pathlib import Path
import hashlib
import json
import subprocess
import argparse
from score_format_release import verify_formats
from library_release import verify_library

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, default=ROOT / 'build.artifacts')
args = parser.parse_args()
OUT = args.directory.resolve()
formats = verify_formats(lambda name: (OUT / name).read_bytes())
paths = ['pianist.html', 'index.html', 'MuseScoreStudio.js', 'MuseScoreStudio.wasm',
         'MuseAudio.js', 'manifest.webmanifest', 'icon.svg', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.md',
         'sound/MS Basic.sf3', 'sound/MS Basic_License.md', 'sound/MS Basic_Readme.md',
         'templates/blank-piano.mscz', 'fixtures/piano.mxl', 'fixtures/piano.abc', 'fixtures/pedal-duration.musicxml']
paths += [p.relative_to(OUT).as_posix() for d in ['app', 'distr'] for p in (OUT / d).rglob('*')
          if p.is_file() and p.suffix in ('.js', '.css')]
paths += [p.relative_to(OUT).as_posix() for p in (OUT / 'examples').glob('*') if p.is_file()]
paths += [p.relative_to(OUT).as_posix() for p in (OUT / 'notices').rglob('*') if p.is_file()]
paths += [p.relative_to(OUT).as_posix() for p in (OUT / 'practice-sources').rglob('*') if p.is_file()]
paths += ['score-formats/manifest.json'] + ['score-formats/' + entry['path'] for entry in formats['files']]
renderer = None
if (OUT / 'renderer').exists():
    renderer = json.loads((OUT / 'renderer/build.json').read_text(encoding='utf-8-sig'))
    expected_paths = {'PianistRenderer.mjs', 'PianistRenderer.wasm'}
    if {entry['path'] for entry in renderer['files']} != expected_paths:
        raise ValueError('Renderer build must contain exactly its glue/WASM pair')
    for entry in renderer['files']:
        data = (OUT / 'renderer' / entry['path']).read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Renderer artifact does not match completed build: ' + entry['path'])
    paths += ['renderer/build.json'] + ['renderer/' + name for name in sorted(expected_paths)]
if (OUT / 'library/catalog.json').exists():
    paths += ['library/catalog.json'] + [s['url'] for s in json.loads((OUT / 'library/catalog.json').read_text(encoding='utf-8'))['songs']]
library_count = verify_library(lambda name: (OUT / name).read_bytes(), set(paths))
files = []
for name in sorted(set(paths)):
    path = OUT / name
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    files.append({'path': name, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()})
template = (ROOT / 'src/web/appjs/viewer/sw-template.js').read_text(encoding='utf-8')
worker_hash = hashlib.sha256(template.encode()).hexdigest()
version = hashlib.sha256(json.dumps({'files': files, 'workerTemplateSha256': worker_hash}, sort_keys=True).encode()).hexdigest()[:20]
source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
source_dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
cache = (ROOT / 'build.m0/CMakeCache.txt').read_text(encoding='utf-8')
fast_link = any(line.startswith('PIANIST_WASM_FAST_LINK:') and line.endswith('=ON') for line in cache.splitlines())
release = {'schemaVersion': 1, 'version': version, 'engineBase': '3654226c2e99289916916953a98e585a3d3b315a',
           'sourceCommit': source_commit, 'sourceDirty': source_dirty, 'optimizedLink': not fast_link, 'files': files,
           'scoreFormats': formats['version'], 'workerTemplateSha256': worker_hash, 'libraryScores': library_count}
if renderer:
    release['renderer'] = {'optimizedLink': renderer['optimizedLink'], 'qt': renderer['qt']}
(OUT / 'release.json').write_text(json.dumps(release, indent=2), encoding='utf-8')
(OUT / 'sw.js').write_text(template.replace('__PIANIST_RELEASE__', json.dumps(release)), encoding='utf-8', newline='\n')
print(f'Packaged {version}: {len(files)} files, {sum(f["bytes"] for f in files)/1024**2:.1f} MiB')
