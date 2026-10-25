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
from score_format_release import verify_formats
from library_release import verify_library
from methods_release import verify_methods
from web_bank_release import verify_web_bank
from native_provenance import verify_native
from release_gate import require_native_gate, verify_release_files, verify_archived_native_inputs, verify_frontend, archive_verified_site

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
    methods = verify_methods(lambda name: (directory / name).read_bytes(), seen)
    if release.get('methodBooks', {'books': 0, 'lessons': 0}) != {k: methods[k] for k in ['books', 'lessons']}:
        raise ValueError('Bundled method-book counts differ from the manifest')
    return release

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New, empty deployment directory')
    phase = parser.add_mutually_exclusive_group()
    phase.add_argument('--prepare-only', action='store_true', help='Prepare the public candidate site without release ZIP/source artifacts; run its full native gate next')
    phase.add_argument('--finalize', action='store_true', help='Finalize an existing candidate only after a matching full native gate')
    parser.add_argument('--gate-report', type=Path, help='Specific full native report; otherwise find a matching local receipt')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and not args.finalize:
        raise SystemExit('Output already exists; choose a new directory. Nothing was replaced.')
    if args.finalize and (not (output / 'site').is_dir() or (output / 'source').exists() or (output / 'pianist-web.zip').exists()):
        raise SystemExit('Finalize requires an existing, not-yet-finalized candidate site. Nothing was replaced.')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()
    if dirty:
        raise SystemExit('Commit the tested source before staging a distributable release.')
    verify_archived_native_inputs(ROOT)
    site = output / 'site'
    if not args.finalize:
        source = ROOT / 'build.artifacts'
        release = verify(source)
        verify_native(ROOT, source)
        verify_frontend(ROOT, source, public=True)
        if release['sourceCommit'] != commit or release['sourceDirty'] or not release['optimizedLink']:
            raise SystemExit('Build/package an optimized release from the current clean commit first.')
        if release.get('renderer') and not release['renderer'].get('optimizedLink'):
            raise SystemExit('Build an optimized exercise renderer before staging.')
        site.mkdir(parents=True)
        for entry in release['files']:
            name = entry['path']
            if name.startswith('examples/') or name.startswith('curriculum/'):
                continue
            target = site / name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, target)
        (site / 'examples').mkdir()
        (site / 'examples/catalog.json').write_text(json.dumps({'examples': [{
            'title': 'Piano khởi động', 'filename': 'Piano khởi động.mxl', 'url': 'fixtures/piano.mxl'
        }]}, ensure_ascii=False, indent=2), encoding='utf-8')
        if release.get('exerciseBank'):
            bank = verify_web_bank(lambda name: (source / name).read_bytes(), public=True)
            pointer = json.loads((source / 'curriculum/manifest.json').read_text(encoding='utf-8'))
            index = json.loads((source / 'curriculum' / pointer['index']['path']).read_text(encoding='utf-8'))
            if index.get('kind') != 'composed-abc-v1':
                raise SystemExit('Package the composed G1–G8 bank before staging this application.')
            for name in bank['paths']:
                target = site / name; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source / name, target)
        subprocess.run([sys.executable, str(ROOT / 'buildscripts/pianist/package-web.py'), '--directory', str(site)], cwd=ROOT, check=True)
    public = verify(site)
    verify_release_files(site, public, exact=True)
    native = verify_native(ROOT, site)
    frontend = verify_frontend(ROOT, site, public=True)
    if public.get('sourceCommit') != commit or public.get('sourceDirty') is not False or not all(item['optimizedLink'] for item in native.values()):
        raise SystemExit('Candidate must match current clean source with optimized native outputs.')
    if args.prepare_only:
        print(json.dumps({'directory': str(output), 'site': str(site), 'version': public['version'], 'sourceCommit': commit,
                          'status': 'candidate-awaiting-full-native-gate', 'distributableCreated': False}, indent=2))
        return
    gate = require_native_gate(ROOT, site, public, commit, args.gate_report.resolve() if args.gate_report else None)
    source_zip = output / 'source' / f'pianist-source-{commit[:12]}.zip'; source_zip.parent.mkdir()
    subprocess.run(['git', 'archive', '--format=zip', '--output=' + str(source_zip), commit], cwd=ROOT, check=True)
    for name in ['Caddyfile', 'compose.yaml', '.env.example', 'DEPLOY.txt']:
        shutil.copy2(ROOT / 'deploy' / name, output / name)
    source_inventory = {'sourceCommit': commit, 'webRelease': public['version'], 'sourceArchive': source_zip.relative_to(output).as_posix(),
        'sourceSha256': digest(source_zip), 'toolchain': json.loads((ROOT / 'buildscripts/pianist/toolchain.json').read_text()),
        'qtSource': 'https://download.qt.io/official_releases/qt/6.10/6.10.2/single/',
        'npmSourceLock': 'apps/pianist-web/package-lock.json', 'vendorSources': 'Included in source archive under src/**/thirdparty and thirdparty',
        'scoreFormats': public['scoreFormats'], 'scoreFormatSourcePins': 'third_party/score-format-sources/manifest.json',
        'deploymentStatus': 'prepared-not-published', 'localScoresIncluded': False, 'publishedLibraryScores': public['libraryScores'],
        'methodBooks': public.get('methodBooks', {'books': 0, 'lessons': 0})}
    source_inventory['nativeBuilds'] = native
    source_inventory['webBuild'] = frontend
    source_inventory['nativeGate'] = gate
    (output / 'SOURCE.json').write_text(json.dumps(source_inventory, indent=2), encoding='utf-8')
    archive_verified_site(site, public, gate, output / 'pianist-web.zip')
    checksum_paths = [output / 'pianist-web.zip', source_zip, output / 'SOURCE.json']
    checksum_paths += [output / name for name in ['Caddyfile', 'compose.yaml', '.env.example', 'DEPLOY.txt']]
    checksums = {p.relative_to(output).as_posix(): digest(p) for p in checksum_paths}
    (output / 'SHA256SUMS.json').write_text(json.dumps(checksums, indent=2), encoding='utf-8')
    print(json.dumps({'directory': str(output), 'version': public['version'], 'files': len(public['files']), 'sourceCommit': commit, 'localScoresIncluded': False}, indent=2))

if __name__ == '__main__':
    main()
