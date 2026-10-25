"""Require evidence from every critical suite against the exact release bytes."""
import json
from pathlib import PurePosixPath
import subprocess
import hashlib
import zipfile
from native_provenance import OUTPUTS, canonical_hash, sha256, source_inputs

SUITES = {
    'studio-workspace': ('studio-workspace.cjs', [], '?diagnostics=1#/library'),
    'library-range-ux': ('library-range-ux.cjs', [], '?diagnostics=1#/library'),
    'native-measure-labels': ('native-measure-labels.cjs', [], '?diagnostics=1#/library'),
    'sample-preview': ('sample-preview.cjs', [], '?diagnostics=1#/library'),
    'sound-output': ('sound-output.cjs', [], '?diagnostics=1#/library'),
    'editor-playback-owner': ('editor-playback-owner.cjs', [], '?diagnostics=1#/library'),
    'pending-results': ('pending-results.cjs', [], '?diagnostics=1#/library'),
    'offline-lifecycle': ('offline-lifecycle.cjs', [], '?diagnostics=1#/library'),
    'calibration-cold': ('calibration-cold.cjs', [], '?diagnostics=1#/practice'),
    'ux-upgrade': ('ux-upgrade.cjs', [], '?diagnostics=1#/library'),
    'native-time-ties': ('native-time-ties.cjs', [], ''),
    'playback-sync': ('playback-sync.cjs', [], ''),
    'native-sheet-integrity': ('native-sheet-integrity.cjs', [], ''),
    'format-integrity': ('format-integrity.cjs', [], '?diagnostics=1#/library'),
    'library-policy': ('library-policy.cjs', [], '?diagnostics=1#/library'),
    'native-preview-free': ('native-preview.cjs', ['--skip-grade'], '?diagnostics=1#/library'),
    'native-preview-grade': ('native-preview.cjs', ['--grade-only'], '?diagnostics=1#/library'),
    'practice-stop': ('practice-stop.cjs', [], '?diagnostics=1#/exercises'),
    'grade-practice': ('grade-practice.cjs', [], '?diagnostics=1#/exercises'),
    'grade-route-guard': ('grade-practice.cjs', ['--route-guard'], '?diagnostics=1#/exercises'),
    'method-practice': ('method-practice.cjs', [], '?diagnostics=1#/practice'),
    'method-native': ('method-native.cjs', [], '?diagnostics=1#/practice'),
    'abc-practice-ui': ('abc-practice-ui.cjs', [], '?diagnostics=1#/library'),
}


def expected_checks():
    return ['release-integrity', 'native-cutover', 'browser-fixtures', *SUITES]


def verify_frontend(root, site, *, public=False):
    command = ['node', str(root / 'buildscripts/pianist/web_provenance.cjs'), 'verify', '--directory', str(site)]
    if public:
        command.append('--public')
    return json.loads(subprocess.check_output(command, cwd=root, text=True))


def verify_archived_native_inputs(root):
    """A public source archive cannot reproduce an ignored local override."""
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z', '--cached'], cwd=root).decode('utf-8').split('\0'))
    inputs = {entry['path'] for target in OUTPUTS for entry in source_inputs(root, target)}
    missing = sorted(inputs - tracked)
    if missing:
        raise ValueError('Native build uses inputs absent from the Git source archive: ' + ', '.join(missing))


def validation_fingerprint(root):
    scopes = ['tests/browser/pianist', 'tests/fixtures/pianist', 'buildscripts/pianist/check-pianist.py',
              'buildscripts/pianist/release_gate.py', 'buildscripts/pianist/verify-release.py',
              'buildscripts/pianist/audit-practice-cutover.py', 'buildscripts/pianist/prepare-check-fixtures.py']
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', *scopes], cwd=root).decode('utf-8').split('\0')
    return canonical_hash([{'path': name, 'sha256': sha256(root / name)} for name in sorted(set(names)) if name and (root / name).is_file()])


def gate_identity(root, site, release):
    return {'schemaVersion': 1, 'releaseSha256': sha256(site / 'release.json'),
            'serviceWorkerSha256': sha256(site / 'sw.js'),
            'version': release['version'], 'sourceCommit': release['sourceCommit'],
            'validationSha256': validation_fingerprint(root), 'requiredChecks': expected_checks()}


def verify_release_files(site, release, *, exact=False):
    seen = set()
    for entry in release['files']:
        name = entry['path']
        relative = PurePosixPath(name)
        path = (site / name).resolve()
        if name in seen or relative.is_absolute() or '..' in relative.parts or '\\' in name or not path.is_relative_to(site.resolve()):
            raise ValueError('Unsafe or duplicate release path: ' + name)
        seen.add(name)
        if not path.is_file() or path.stat().st_size != entry['bytes'] or sha256(path) != entry['sha256']:
            raise ValueError('Release bytes changed: ' + name)
    if exact:
        actual = set()
        for path in site.rglob('*'):
            if path.is_symlink() or not path.resolve().is_relative_to(site.resolve()):
                raise ValueError('Linked path in public web root: ' + str(path))
            if path.is_file():
                actual.add(path.relative_to(site).as_posix())
        if actual != seen | {'release.json', 'sw.js'}:
            raise ValueError('Public web root contains unlisted or missing files')


def validate_receipt(report, identity, commit):
    if report.get('mode') != 'native' or report.get('passed') is not True:
        raise ValueError('Receipt is not a successful full native gate')
    if report.get('sourceCommit') != commit or report.get('sourceDirty') is not False:
        raise ValueError('Native gate did not run from the current clean source')
    if report.get('nativeGate') != identity:
        raise ValueError('Native gate differs from this release or validation source')
    tested = report.get('testedRelease', {})
    if tested != ({key: identity[key] for key in ('version', 'sourceCommit')} | {'sourceDirty': False}):
        raise ValueError('Native gate tested another package')
    checks = report.get('checks', [])
    if [entry.get('name') for entry in checks] != identity['requiredChecks'] or any(entry.get('exitCode') != 0 for entry in checks):
        raise ValueError('Native gate is missing required successful suites')


def require_native_gate(root, site, release, commit, report_path=None):
    identity = gate_identity(root, site, release)
    candidates = [report_path] if report_path else sorted((root / 'artifacts/checks').glob('*-native/report.json'), reverse=True)
    for candidate in candidates:
        try:
            report = json.loads(candidate.read_text(encoding='utf-8'))
            validate_receipt(report, identity, commit)
            return {'report': str(candidate.relative_to(root)) if candidate.is_relative_to(root) else str(candidate),
                    'reportSha256': sha256(candidate), **identity}
        except (OSError, ValueError, TypeError, KeyError):
            continue
    raise ValueError('No successful full native gate matches these exact bytes/source. Run check-pianist.py native --site "' + str(site) + '" --public, then stage-release.py --output "' + str(site.parent) + '" --finalize.')


def archive_verified_site(site, release, gate, destination):
    """Read/hash each member once so a concurrent rebuild cannot change ZIP bytes."""
    expected = {entry['path']: entry for entry in release['files']}
    expected.update({'release.json': {'sha256': gate['releaseSha256']},
                     'sw.js': {'sha256': gate['serviceWorkerSha256']}})
    temporary = destination.with_suffix(destination.suffix + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, entry in sorted(expected.items()):
                data = (site / name).read_bytes()
                if hashlib.sha256(data).hexdigest() != entry['sha256'] or ('bytes' in entry and len(data) != entry['bytes']):
                    raise ValueError('Candidate changed during archive creation: ' + name)
                archive.writestr(name, data)
        verify_release_files(site, release, exact=True)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
