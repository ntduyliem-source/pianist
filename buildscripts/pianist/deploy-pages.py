"""Download an exact optimized release, verify it, then prepare a Pages artifact."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    tag = manifest['tag']
    if not re.fullmatch(r'pianist-web-[a-zA-Z0-9.-]+', tag): raise ValueError('Unsafe release tag')
    if not re.fullmatch(r'[a-f0-9]{64}', manifest['sha256']): raise ValueError('Invalid archive hash')
    output = args.output.resolve()
    if output.exists(): raise ValueError('Output already exists')
    output.mkdir(parents=True)
    archive = output.parent / (output.name + '.zip')
    url = 'https://github.com/ntduyliem-source/pianist/releases/download/' + tag + '/pianist-web.zip'
    h = hashlib.sha256()
    with urlopen(Request(url, headers={'User-Agent': 'Pianist-release-deployer'}), timeout=120) as response, archive.open('wb') as target:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > 250 * 1024**2: raise ValueError('Release archive too large')
            h.update(chunk); target.write(chunk)
    if h.hexdigest() != manifest['sha256']: raise ValueError('Release archive integrity failed')
    with zipfile.ZipFile(archive) as bundle:
        if sum(p.file_size for p in bundle.infolist()) > 512 * 1024**2: raise ValueError('Release expands beyond the limit')
        for entry in bundle.infolist():
            if not (output / entry.filename).resolve().is_relative_to(output) or '\\' in entry.filename or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive member')
        bundle.extractall(output)
    release = json.loads((output / 'release.json').read_text(encoding='utf-8'))
    if release['sourceCommit'] != manifest['sourceCommit'] or release['version'] != manifest['version']:
        raise ValueError('Release/source mismatch')
    subprocess.run([sys.executable, str(ROOT / 'buildscripts/pianist/verify-release.py'), '--directory', str(output), '--public'], check=True)


if __name__ == '__main__': main()
