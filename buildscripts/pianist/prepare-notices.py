"""Collect installed runtime license texts and Qt's vendor-supplied SBOM."""
from pathlib import Path
import json
import shutil
import subprocess
import hashlib

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'build.artifacts/notices'
inventory = []
# Explicit ABC notices include LGPL variants and the Pyodide/stdlib notice text;
# their filenames do not all match the generic LICENSE/COPYING scan below.
formats = ROOT / 'third_party/score-format-sources'
pins = json.loads((formats / 'manifest.json').read_text(encoding='utf-8'))
for source in sorted((formats / 'licenses').glob('*')):
    if not source.is_file(): continue
    destination = OUT / 'score-formats' / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    inventory.append({'package': 'ABC converters / Pyodide', 'file': destination.relative_to(OUT).as_posix(),
                      'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceNotice': True})
(OUT / 'score-formats/pins.json').write_text(json.dumps(pins, indent=2), encoding='utf-8')
# Practice source pins/licenses are part of the offline source offer as well.
practice = ROOT / 'third_party/practice-sources'
if practice.exists():
    stage = (ROOT / 'build.artifacts/practice-sources').resolve()
    assert stage.parent == (ROOT / 'build.artifacts').resolve() and stage.name == 'practice-sources'
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(practice, stage, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
# Include notices shipped in the pinned source tree, preserving their paths so
# the recipient can locate the relevant component in the source archive.
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
for name in tracked:
    source = ROOT / name
    if not source.is_file() or source.name.lower() not in {'license', 'license.txt', 'license.md', 'copying', 'copying.txt', 'copying.lesser', 'notice', 'notice.txt'}:
        continue
    destination = OUT / 'source' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    inventory.append({'package': source.parent.relative_to(ROOT).as_posix(), 'file': destination.relative_to(OUT).as_posix(),
                      'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceNotice': True})
for package in ('react', 'react-dom', 'scheduler', 'fflate', 'tone', '@tonejs/piano', 'tslib', 'standardized-audio-context', 'automation-events'):
    source = ROOT / 'apps/pianist-web/node_modules' / package
    metadata = json.loads((source / 'package.json').read_text(encoding='utf-8'))
    license_file = next(p for p in source.iterdir() if p.name.lower() in ('license', 'license.txt', 'license.md'))
    destination = OUT / 'javascript' / f'{package}-LICENSE.txt'
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(license_file, destination)
    inventory.append({'package': package, 'version': metadata['version'], 'license': metadata.get('license'), 'file': destination.relative_to(OUT).as_posix()})

qt = ROOT / '.tools/Qt/6.10.2/wasm_singlethread/sbom'
for source in sorted(qt.glob('*.spdx.json')):
    data = json.loads(source.read_text(encoding='utf-8'))
    destination = OUT / 'qt' / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    texts = data.get('hasExtractedLicensingInfos', [])
    (destination.with_suffix('.licenses.txt')).write_text('\n\n'.join(
        f"{item.get('licenseId', '')}\n{item.get('name', '')}\n{item.get('extractedText', '')}" for item in texts), encoding='utf-8')
    inventory.append({'package': source.stem, 'version': '6.10.2', 'file': destination.relative_to(OUT).as_posix(), 'licenseTexts': len(texts)})

(OUT / 'inventory.json').write_text(json.dumps(inventory, indent=2), encoding='utf-8')
print(f'Collected {len(inventory)} installed runtime packages/SBOMs; font and sound notices are staged by install.js.')
