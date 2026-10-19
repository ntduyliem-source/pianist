"""Verify pinned converters and stage the minimal, same-origin Python runtime."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'third_party/score-format-sources'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(output):
    manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    cache = ROOT / '.tools/score-formats/downloads'
    cache.mkdir(parents=True, exist_ok=True)
    staged = []

    def write(relative, data):
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        staged.append({'path': relative, 'bytes': len(data), 'sha256': digest(data)})

    for converter in manifest['converters']:
        for item in converter['files']:
            data = (SOURCE / item['path']).read_bytes()
            if len(data) != item['bytes'] or digest(data) != item['sha256']:
                raise ValueError('Pinned converter changed: ' + item['path'])
            write('python/' + item['path'].split('/')[-1], data)

    runtime = manifest['runtime']
    archive = cache / ('pyodide-' + runtime['version'] + '.tgz')
    data = archive.read_bytes() if archive.exists() else b''
    if digest(data) != runtime['archiveSha256']:
        data = urllib.request.urlopen(runtime['url'], timeout=60).read()
        if digest(data) != runtime['archiveSha256']:
            raise ValueError('Pyodide archive integrity failed')
        archive.write_bytes(data)
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as bundle:
        for item in runtime['files']:
            data = bundle.extractfile('package/' + item['path']).read()
            if len(data) != item['bytes'] or digest(data) != item['sha256']:
                raise ValueError('Pyodide file integrity failed: ' + item['path'])
            write('pyodide/' + item['path'], data)

    wrapper = ROOT / 'packages/score-formats/python/converter.py'
    write('python/converter.py', wrapper.read_bytes())
    for path in sorted((SOURCE / 'licenses').glob('*')):
        if path.is_file():
            write('licenses/' + path.name, path.read_bytes())
    release = {'schemaVersion': 1, 'version': 'abc2xml-2.68+xml2abc-1.77+pyodide-314.0.7', 'files': staged}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'manifest.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
    print(f'Score formats staged: {len(staged)} files, {sum(f["bytes"] for f in staged):,} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'build.artifacts/score-formats')
    prepare(parser.parse_args().output.resolve())
