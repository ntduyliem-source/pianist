"""Run Pianist checks from one entrypoint, without building/replacing native assets.

fast: source/type/unit/oracle/grade checks; fresh checkout, no WASM required.
browser: selected or all critical browser suites against an existing package.
native: full package/cutover verification followed by all critical browser suites.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/pianist-web'
SCRIPTS = ROOT / 'buildscripts/pianist'
BROWSER = ROOT / 'tests/browser/pianist'
SUITES = {
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
    'abc-practice-ui': ('abc-practice-ui.cjs', [], '?diagnostics=1#/library'),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['fast', 'browser', 'native'])
    parser.add_argument('--site', type=Path, default=ROOT / 'build.artifacts')
    parser.add_argument('--url', help='Optional existing site page URL without query/hash; otherwise start an owned loopback server')
    parser.add_argument('--suite', action='append', choices=SUITES, help='Browser mode only; repeat to select suites in the given order')
    parser.add_argument('--public', action='store_true', help='Native gate: reject private/unlisted release assets too')
    parser.add_argument('--list', action='store_true', help='Print selected checks without running them')
    args = parser.parse_args()
    if args.suite and args.mode != 'browser':
        parser.error('--suite is only for browser iteration; native always runs every critical suite')
    suites = args.suite or list(SUITES)
    fast_labels = ['source-pins', 'tooling-index', 'format', 'typecheck', 'typescript-oracles', 'python-library-grade', 'authored-grades', 'source-cutover']
    labels = fast_labels if args.mode == 'fast' else ['browser-fixtures', *suites]
    if args.mode == 'native':
        labels = ['release-integrity', 'native-cutover', *labels]
    if args.list:
        print('\n'.join(labels))
        return 0
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    output = ROOT / 'artifacts/checks' / (stamp + '-' + args.mode)
    output.mkdir(parents=True)
    report = {'mode': args.mode, 'passed': False, 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'checks': []}
    env = dict(os.environ, PYTHONUTF8='1', PIANIST_PYTHON=sys.executable)
    # The R4 oracle intentionally invokes `python`; use this runner's interpreter.
    env['PATH'] = str(Path(sys.executable).parent) + os.pathsep + env.get('PATH', '')
    server = None
    server_log = None

    def run(label, command, cwd=ROOT, extra=None):
        log = output / (label + '.log')
        print('START ' + label, flush=True)
        started = time.monotonic()
        with log.open('w', encoding='utf-8') as stream:
            result = subprocess.run([str(item) for item in command], cwd=cwd, env={**env, **(extra or {})}, stdout=stream, stderr=subprocess.STDOUT)
        row = {'name': label, 'exitCode': result.returncode, 'seconds': round(time.monotonic() - started, 2), 'log': str(log.relative_to(ROOT))}
        report['checks'].append(row)
        if result.returncode:
            print('\n'.join(log.read_text(encoding='utf-8', errors='replace').splitlines()[-50:]), flush=True)
            raise RuntimeError(f'{label} failed; see {log}')
        print(f'PASS {label} ({row["seconds"]}s)', flush=True)

    try:
        if args.mode == 'fast':
            npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
            if not npm or not (APP / 'node_modules/typescript').is_dir():
                raise RuntimeError('Install Node and run npm ci --prefix apps/pianist-web first.')
            run('source-pins', [sys.executable, SCRIPTS / 'check-source-pins.py'])
            run('tooling-index', [sys.executable, SCRIPTS / 'check-tooling.py'])
            run('format', [npm, 'run', 'format:check'], APP)
            run('typecheck', [npm, 'exec', '--', 'tsc', '--noEmit'], APP)
            run('typescript-oracles', [npm, 'test'], APP)
            run('python-library-grade', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/library', '-p', 'test_*.py'])
            run('authored-grades', [sys.executable, SCRIPTS / 'check-authored-grades.py'])
            run('source-cutover', [sys.executable, SCRIPTS / 'audit-practice-cutover.py', '--source-only'])
        else:
            site = args.site.resolve()
            for name in ['release.json', 'pianist.html', 'MuseScoreStudio.wasm', 'renderer/PianistRenderer.wasm', 'curriculum/manifest.json']:
                if not (site / name).is_file():
                    raise RuntimeError(f'Missing packaged asset {site / name}; build/package first. This check never downloads or builds WASM.')
            if not (BROWSER / 'node_modules/playwright').is_dir():
                raise RuntimeError('Run npm ci --prefix tests/browser/pianist and install Microsoft Edge first.')
            release = json.loads((site / 'release.json').read_text(encoding='utf-8'))
            report['testedRelease'] = {key: release.get(key) for key in ['version', 'sourceCommit', 'sourceDirty']}
            if args.mode == 'native':
                run('release-integrity', [sys.executable, SCRIPTS / 'verify-release.py', '--directory', site, *(['--public'] if args.public else [])])
                run('native-cutover', [sys.executable, SCRIPTS / 'audit-practice-cutover.py', '--build-directory', site])
            run('browser-fixtures', [sys.executable, SCRIPTS / 'prepare-check-fixtures.py'])
            if args.url:
                parsed = urlparse(args.url)
                if parsed.scheme not in ('http', 'https') or parsed.query or parsed.fragment or parsed.username or parsed.password:
                    raise ValueError('--url must be a plain page URL without credentials, query or hash')
                base = args.url
            else:
                with socket.socket() as sock:
                    sock.bind(('127.0.0.1', 0))
                    port = sock.getsockname()[1]
                server_log = (output / 'server.log').open('w', encoding='utf-8')
                server = subprocess.Popen([sys.executable, str(SCRIPTS / 'serve-web.py'), '--directory', str(site), '--port', str(port)], cwd=ROOT, env=env, stdout=server_log, stderr=subprocess.STDOUT)
                base = f'http://127.0.0.1:{port}/pianist.html'
            manifest_url = base.rsplit('/', 1)[0] + '/release.json'
            deadline = time.monotonic() + 20
            while True:
                try:
                    with urlopen(manifest_url, timeout=2) as response:
                        served = json.load(response)
                    if served.get('version') != release['version']:
                        raise ValueError('Served release differs from --site; refusing to test a different build')
                    break
                except OSError:
                    if time.monotonic() >= deadline or (server and server.poll() is not None):
                        raise RuntimeError('Site did not start; see server.log or check --url')
                    time.sleep(.2)
            report['url'] = base
            # Some existing native runners explicitly select Edge. Use one channel
            # consistently rather than pretend a different channel was tested.
            for name in suites:
                filename, options, suffix = SUITES[name]
                run(name, ['node', BROWSER / filename, *options], extra={'PIANIST_URL': base + suffix, 'PIANIST_BROWSER_CHANNEL': 'msedge'})
        report['passed'] = True
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        report['error'] = str(error)
        print('FAIL ' + str(error), file=sys.stderr, flush=True)
    finally:
        if server and server.poll() is None:
            # Only terminate the server process created by this invocation.
            server.terminate()
            server.wait(timeout=10)
        if server_log:
            server_log.close()
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print('Report: ' + str(output / 'report.json'), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
