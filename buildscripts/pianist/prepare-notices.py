"""Collect installed runtime license texts and Qt's vendor-supplied SBOM."""
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'build.artifacts/notices'
inventory = []
for package in ('react', 'react-dom', 'scheduler', 'fflate'):
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
