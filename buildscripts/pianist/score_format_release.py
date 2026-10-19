"""Validate the staged ABC runtime against the checked-in source pins."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'third_party/score-format-sources'


def expected_files():
    pins = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    expected = {}
    for converter in pins['converters']:
        for item in converter['files']:
            expected['python/' + Path(item['path']).name] = {k: item[k] for k in ('bytes', 'sha256')}
    for item in pins['runtime']['files']:
        expected['pyodide/' + item['path']] = {k: item[k] for k in ('bytes', 'sha256')}
    for path, name in [(ROOT / 'packages/score-formats/python/converter.py', 'python/converter.py')] + [
            (p, 'licenses/' + p.name) for p in sorted((SOURCE / 'licenses').glob('*')) if p.is_file()]:
        data = path.read_bytes()
        expected[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    version = '+'.join(f"{p['name']}-{p['version']}" for p in pins['converters'] + [pins['runtime']])
    return version, expected


def verify_formats(read):
    version, expected = expected_files()
    manifest = json.loads(read('score-formats/manifest.json'))
    actual = {entry['path']: {k: entry[k] for k in ('bytes', 'sha256')} for entry in manifest['files']}
    if manifest.get('schemaVersion') != 1 or manifest.get('version') != version or actual != expected or len(actual) != len(manifest['files']):
        raise ValueError('ABC runtime manifest does not match the pinned converters/runtime/source')
    for name, item in expected.items():
        data = read('score-formats/' + name)
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('ABC runtime integrity failed: ' + name)
    return manifest
