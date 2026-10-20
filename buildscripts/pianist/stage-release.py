"""Create a public-safe deployment bundle and its exact Git source archive.

No server/account is configured or published by this command. Local scores,
test evidence, SDKs and browser storage are never copied into the web root.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from score_format_release import verify_formats
from library_release import verify_library

ROOT = Path(__file__).resolve().parents[2]

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def verify(directory):
    release = json.loads((directory / 'release.json').read_text(encoding='utf-8'))
    formats = verify_formats(lambda name: (directory / name).read_bytes())
    if release.get('scoreFormats') != formats['version']:
        raise ValueError('Release is missing the pinned ABC runtime')
    seen = set()
    for entry in release['files']:
        path = (directory / entry['path']).resolve()
        if not path.is_relative_to(directory.resolve()) or entry['path'] in seen:
            raise ValueError('Unsafe or duplicate release path')
        seen.add(entry['path'])
        if not path.is_file() or path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']:
            raise ValueError('Release integrity failed: ' + entry['path'])
    if release.get('libraryScores', 0) != verify_library(lambda name: (directory / name).read_bytes(), seen):
        raise ValueError('Bundled library count differs from the manifest')
    return release

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New, empty deployment directory')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        raise SystemExit('Output already exists; choose a new directory. Nothing was replaced.')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()
    if dirty:
        raise SystemExit('Commit the tested source before staging a distributable release.')
    source = ROOT / 'build.artifacts'
    release = verify(source)
    if release['sourceCommit'] != commit or release['sourceDirty'] or not release['optimizedLink']:
        raise SystemExit('Build/package an optimized release from the current clean commit first.')
    if release.get('renderer') and not release['renderer'].get('optimizedLink'):
        raise SystemExit('Build an optimized exercise renderer before staging.')
    site = output / 'site'; site.mkdir(parents=True)
    for entry in release['files']:
        name = entry['path']
        if name.startswith('examples/'):
            continue
        target = site / name; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / name, target)
    (site / 'examples').mkdir()
    (site / 'examples/catalog.json').write_text(json.dumps({'examples': [{
        'title': 'Piano khởi động', 'filename': 'Piano khởi động.mxl', 'url': 'fixtures/piano.mxl'
    }]}, ensure_ascii=False, indent=2), encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'buildscripts/pianist/package-web.py'), '--directory', str(site)], cwd=ROOT, check=True)
    public = verify(site)
    source_zip = output / 'source' / f'pianist-source-{commit[:12]}.zip'; source_zip.parent.mkdir()
    subprocess.run(['git', 'archive', '--format=zip', '--output=' + str(source_zip), commit], cwd=ROOT, check=True)
    for name in ['Caddyfile', 'compose.yaml', '.env.example', 'DEPLOY.txt']:
        shutil.copy2(ROOT / 'deploy' / name, output / name)
    source_inventory = {'sourceCommit': commit, 'webRelease': public['version'], 'sourceArchive': source_zip.relative_to(output).as_posix(),
        'sourceSha256': digest(source_zip), 'toolchain': json.loads((ROOT / 'buildscripts/pianist/toolchain.json').read_text()),
        'qtSource': 'https://download.qt.io/official_releases/qt/6.10/6.10.2/single/',
        'npmSourceLock': 'apps/pianist-web/package-lock.json', 'vendorSources': 'Included in source archive under src/**/thirdparty and thirdparty',
        'scoreFormats': public['scoreFormats'], 'scoreFormatSourcePins': 'third_party/score-format-sources/manifest.json',
        'deploymentStatus': 'prepared-not-published', 'localScoresIncluded': False, 'publishedLibraryScores': public['libraryScores']}
    (output / 'SOURCE.json').write_text(json.dumps(source_inventory, indent=2), encoding='utf-8')
    with zipfile.ZipFile(output / 'pianist-web.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(site.rglob('*')):
            if path.is_file(): archive.write(path, path.relative_to(site).as_posix())
    checksum_paths = [output / 'pianist-web.zip', source_zip, output / 'SOURCE.json']
    checksum_paths += [output / name for name in ['Caddyfile', 'compose.yaml', '.env.example', 'DEPLOY.txt']]
    checksums = {p.relative_to(output).as_posix(): digest(p) for p in checksum_paths}
    (output / 'SHA256SUMS.json').write_text(json.dumps(checksums, indent=2), encoding='utf-8')
    print(json.dumps({'directory': str(output), 'version': public['version'], 'files': len(public['files']), 'sourceCommit': commit, 'localScoresIncluded': False}, indent=2))

if __name__ == '__main__':
    main()
