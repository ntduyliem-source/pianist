"""Bind completed native binaries to source inputs, not the packaging commit.

The scopes deliberately include shared/native resources conservatively. A web
CSS/React/content-only edit can reuse native outputs; a native input change must
go through a successful incremental build before it can be packaged.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUTS = {
    'app': ('MuseScoreStudio.js', 'MuseScoreStudio.wasm'),
    'audio': ('MuseAudio.js',),
    'renderer': ('PianistRenderer.mjs', 'PianistRenderer.wasm'),
}
COMMON = ('CMakeLists.txt', 'buildscripts', 'thirdparty')
NATIVE_TOOLS = {'build-web.ps1', 'build-renderer.ps1', 'toolchain.json', 'native_provenance.py'}
EXCLUDED = ('src/web/appjs/distr/', 'src/web/appjs/viewer/', 'src/web/appjs/templates/')


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def source_inputs(root, target):
    if target not in OUTPUTS:
        raise ValueError('Unknown native target: ' + target)
    scopes = [*COMMON]
    scopes += ['src/framework', 'src/web/audioengine'] if target == 'audio' else ['src', 'share', 'fonts', 'vtest']
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', *scopes], cwd=root).decode('utf-8').split('\0')
    # Root configure/version includes can also have an ignored local override.
    # Such an override affects the build even though it is absent from git ls-files.
    names += [path.name for path in root.glob('*.cmake') if path.is_file()]
    names += [path.relative_to(root).as_posix() for path in (root / 'buildscripts').rglob('*.cmake') if path.is_file()]
    result = []
    for name in sorted(set(names)):
        if not name or name.startswith(EXCLUDED) or name == 'src/web/appjs/install.js':
            continue
        if name.startswith('buildscripts/pianist/') and name.rsplit('/', 1)[-1] not in NATIVE_TOOLS:
            continue
        path = root / name
        if path.is_file():
            result.append({'path': name, 'sha256': sha256(path)})
    if not result:
        raise ValueError('Native source input set is empty')
    return result


def build_config(root, build_dir, target):
    values = {}
    pattern = re.compile(r'^(CMAKE_BUILD_TYPE|CMAKE_TOOLCHAIN_FILE|CMAKE_(?:C|CXX)_COMPILER|CMAKE_(?:C|CXX|EXE_LINKER|SHARED_LINKER|STATIC_LINKER)_FLAGS.*|MUSE_.*|MUE_.*|MUSESCORE_.*|PIANIST_.*|QT_.*)$')
    for line in (build_dir / 'CMakeCache.txt').read_text(encoding='utf-8').splitlines():
        if line.startswith(('#', '//')) or ':' not in line or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.split(':', 1)[0]
        if not pattern.fullmatch(key):
            continue
        if (target == 'app' and key == 'PIANIST_RENDERER_FAST_LINK') or (target == 'renderer' and key == 'PIANIST_WASM_FAST_LINK'):
            continue
        values[key] = value.replace(str(root), '${ROOT}').replace(root.as_posix(), '${ROOT}')
    if values.get('CMAKE_BUILD_TYPE') != 'Release':
        raise ValueError('Native provenance requires a configured Release build')
    return values


def input_snapshot(root, target, config):
    files = source_inputs(root, target)
    return {'target': target, 'sourceInputCount': len(files), 'sourceInputsSha256': canonical_hash(files),
            'configuration': config, 'inputSha256': canonical_hash({'target': target, 'files': files, 'configuration': config})}


def begin(root, target, build_dir, receipt):
    state = {'schemaVersion': 1, **input_snapshot(root, target, build_config(root, build_dir, target))}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(state, indent=2), encoding='utf-8')
    return state


def complete(root, target, build_dir, receipt, directory, output):
    before = json.loads(receipt.read_text(encoding='utf-8'))
    current = input_snapshot(root, target, build_config(root, build_dir, target))
    if before.get('schemaVersion') != 1 or before.get('target') != target or before.get('inputSha256') != current['inputSha256']:
        raise ValueError('Native inputs changed during build; rerun the build before publishing ' + target)
    config = current['configuration']
    optimized = config.get('PIANIST_WASM_FAST_LINK', 'OFF') != 'ON' if target == 'app' else config.get('PIANIST_RENDERER_FAST_LINK', 'OFF') != 'ON' if target == 'renderer' else True
    result = {'schemaVersion': 1, **current, 'optimizedLink': optimized,
              'builtAt': datetime.now(timezone.utc).isoformat(),
              'sourceCommitAtBuild': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
              'files': [{'path': name, 'bytes': (directory / name).stat().st_size, 'sha256': sha256(directory / name)} for name in OUTPUTS[target]]}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    receipt.unlink()
    return result


def verify_native(root, directory):
    """Local packaging check: reject old bytes even if HEAD/package was updated."""
    result = {}
    for target, names in OUTPUTS.items():
        path = directory / 'native' / (target + '.json')
        if not path.is_file():
            raise ValueError(f'Missing native provenance for {target}; rerun build-{ "renderer" if target == "renderer" else "web"}.ps1 (incremental is sufficient)')
        stamp = json.loads(path.read_text(encoding='utf-8'))
        if stamp.get('schemaVersion') != 1 or stamp.get('target') != target or not isinstance(stamp.get('configuration'), dict):
            raise ValueError('Invalid native provenance: ' + target)
        current = input_snapshot(root, target, stamp['configuration'])
        if stamp.get('inputSha256') != current['inputSha256'] or stamp.get('sourceInputsSha256') != current['sourceInputsSha256']:
            raise ValueError('Stale native inputs: ' + target + '. Rebuild this target before packaging.')
        base = directory / 'renderer' if target == 'renderer' else directory
        files = stamp.get('files', [])
        if {entry.get('path') for entry in files} != set(names) or len(files) != len(names):
            raise ValueError('Invalid native output inventory: ' + target)
        for entry in files:
            artifact = base / entry['path']
            if not artifact.is_file() or artifact.stat().st_size != entry.get('bytes') or sha256(artifact) != entry.get('sha256'):
                raise ValueError('Native output differs from its completed build: ' + target + '/' + entry['path'])
        result[target] = {'inputSha256': current['inputSha256'], 'optimizedLink': stamp.get('optimizedLink') is True}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['begin', 'complete', 'verify'])
    parser.add_argument('--target', choices=OUTPUTS)
    parser.add_argument('--build-dir', type=Path)
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--directory', type=Path, default=ROOT / 'build.artifacts')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.operation == 'verify':
        result = verify_native(ROOT, args.directory.resolve())
    else:
        if not args.target or not args.build_dir or not args.receipt or (args.operation == 'complete' and not args.output):
            parser.error('Build begin/complete require --target, --build-dir, --receipt, and complete requires --output')
        common = (ROOT, args.target, args.build_dir.resolve(), args.receipt.resolve())
        result = begin(*common) if args.operation == 'begin' else complete(*common, args.directory.resolve(), args.output.resolve())
    print(json.dumps(result if args.operation == 'verify' else {key: result[key] for key in ('target', 'inputSha256', 'sourceInputCount')}, indent=2))


if __name__ == '__main__':
    main()
