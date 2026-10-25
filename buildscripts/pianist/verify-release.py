"""Verify release contents locally or through the real hosting headers.

Remote checks require HTTPS with normal certificate validation. HTTP is only
allowed explicitly for loopback development; it never counts as HTTPS evidence.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen
from score_format_release import verify_formats
from library_release import verify_library
from methods_release import verify_methods
from web_bank_release import verify_web_bank

HEADERS = {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
           'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--directory', type=Path)
    source.add_argument('--url')
    parser.add_argument('--allow-http-loopback', action='store_true')
    parser.add_argument('--public', action='store_true', help='Reject local/private example entries')
    parser.add_argument('--github-pages', action='store_true', help='Verify a static Pages host, which cannot set application response headers')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    base = args.url.rstrip('/') + '/' if args.url else None
    if base:
        parsed = urlparse(base)
        if parsed.scheme != 'https' and not (args.allow_http_loopback and parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1', 'localhost', '::1'}):
            raise SystemExit('Use HTTPS; HTTP is only allowed explicitly for loopback.')
        if parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise SystemExit('Supply a plain origin/path without credentials, query or fragment.')
    def read(name):
        if base:
            with urlopen(Request(urljoin(base, quote(name, safe='/')), headers={'Accept-Encoding': 'identity'}), timeout=30) as response:
                destination = urlparse(response.url)
                origin = urlparse(base)
                if (destination.scheme, destination.netloc) != (origin.scheme, origin.netloc):
                    raise ValueError('Unexpected cross-origin or protocol redirect: ' + name)
                for header, expected in HEADERS.items():
                    if not args.github_pages and response.headers.get(header) != expected: raise ValueError(f'{name}: missing {header}={expected}')
                if not args.github_pages and 'midi=(self)' not in response.headers.get('Permissions-Policy', ''):
                    raise ValueError(name + ': missing MIDI permission policy')
                if name.endswith('.wasm') and response.headers.get_content_type() != 'application/wasm': raise ValueError('Wrong WASM MIME')
                if name in {'release.json', 'sw.js', 'pianist.html', 'app/pianist.js', 'MuseScoreStudio.js', 'MuseScoreStudio.wasm'} or name.startswith('score-formats/'):
                    if not args.github_pages and not any(value in response.headers.get('Cache-Control', '') for value in ['no-cache', 'no-store']): raise ValueError(name + ': mutable URL must revalidate')
                return response.read()
        path = (args.directory / name).resolve()
        if not path.is_relative_to(args.directory.resolve()): raise ValueError('Unsafe release path')
        return path.read_bytes()
    release = json.loads(read('release.json'))
    if release.get('exerciseBank'):
        bank = verify_web_bank(read, public=args.public)
        if {k: bank[k] for k in ['releaseId', 'count', 'visibility']} != release['exerciseBank']:
            raise ValueError('Release/bank mismatch')
        if not set(bank['paths']).issubset({f['path'] for f in release['files']}):
            raise ValueError('Bank has files outside the release manifest')
    if release.get('schemaVersion') != 1 or not release.get('optimizedLink'): raise ValueError('Not an optimized release')
    if release.get('renderer') and not release['renderer'].get('optimizedLink'):
        raise ValueError('Exercise renderer is not an optimized release')
    expected_version = hashlib.sha256(json.dumps({'files': release['files'], 'workerTemplateSha256': release.get('workerTemplateSha256')}, sort_keys=True).encode()).hexdigest()[:20]
    if release.get('version') != expected_version: raise ValueError('Release version does not match its manifest')
    if args.public and release.get('sourceDirty') is not False: raise ValueError('Public bundle must reference clean source')
    seen = set(); total = 0
    for entry in release['files']:
        name = entry['path']; path = PurePosixPath(name)
        if name in seen or path.is_absolute() or '..' in path.parts or '\\' in name: raise ValueError('Unsafe/duplicate path')
        seen.add(name)
        if args.public and name.startswith('examples/') and name != 'examples/catalog.json': raise ValueError('Private example in public release')
        data = read(name); total += len(data)
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']: raise ValueError('Hash/size mismatch: ' + name)
    sw = read('sw.js').decode('utf-8')
    embedded, _ = json.JSONDecoder().raw_decode(sw.split('const RELEASE = ', 1)[1])
    if embedded != release: raise ValueError('Service worker/manifest version mismatch')
    template = sw.replace('const RELEASE = ' + json.dumps(embedded) + ';', 'const RELEASE = __PIANIST_RELEASE__;')
    if hashlib.sha256(template.encode()).hexdigest() != release.get('workerTemplateSha256'): raise ValueError('Service worker template hash mismatch')
    formats = verify_formats(read)
    library_count = verify_library(read, seen)
    if release.get('libraryScores', 0) != library_count: raise ValueError('Bundled library count mismatch')
    methods = verify_methods(read, seen)
    method_counts = {k: methods[k] for k in ['books', 'lessons']}
    if release.get('methodBooks', {'books': 0, 'lessons': 0}) != method_counts: raise ValueError('Bundled method-book count mismatch')
    if release.get('scoreFormats') != formats['version']: raise ValueError('ABC runtime version mismatch')
    if not {'score-formats/manifest.json', *('score-formats/' + e['path'] for e in formats['files'])}.issubset(seen): raise ValueError('ABC files missing from release/offline manifest')
    if release.get('renderer'):
        if not {'renderer/build.json', 'renderer/PianistRenderer.mjs', 'renderer/PianistRenderer.wasm'}.issubset(seen):
            raise ValueError('Renderer files missing from release/offline manifest')
        renderer_build = json.loads(read('renderer/build.json').decode('utf-8-sig'))
        if not renderer_build.get('optimizedLink'):
            raise ValueError('Renderer build stamp is not optimized')
    if args.public:
        catalog = json.loads(read('examples/catalog.json'))
        if any(e['url'] != 'fixtures/piano.mxl' for e in catalog['examples']): raise ValueError('Non-public sample catalog')
        if args.directory:
            actual = {p.relative_to(args.directory).as_posix() for p in args.directory.rglob('*') if p.is_file()}
            if actual != seen | {'release.json', 'sw.js'}: raise ValueError('Public web root contains unlisted or missing files')
    report = {'passed': True, 'version': release['version'], 'sourceCommit': release['sourceCommit'], 'sourceDirty': release['sourceDirty'],
              'resources': len(seen), 'bytes': total, 'scoreFormats': formats['version'], 'libraryScores': library_count,
              'methodBooks': method_counts, 'headersChecked': bool(base), 'customHeadersRequired': not args.github_pages, 'httpsChecked': bool(base and urlparse(base).scheme == 'https'), 'publicExamplesChecked': args.public}
    if args.report: args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
