"""Verify committed converter/reference provenance without downloading runtimes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


if __name__ == '__main__':
    checked = 0
    for folder, key in [('score-format-sources', 'converters'), ('practice-sources', 'sources')]:
        directory = ROOT / 'third_party' / folder
        manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
        for source in manifest[key]:
            for item in source['files']:
                path = directory / item['path'] if key == 'converters' else directory / source['name'] / item['path']
                data = path.read_bytes()
                if hashlib.sha256(data).hexdigest() != item['sha256'] or ('bytes' in item and len(data) != item['bytes']):
                    raise ValueError('Pinned upstream file changed: ' + str(path.relative_to(ROOT)))
                checked += 1
    print(f'Verified {checked} committed upstream files; no downloads or source updates.')
