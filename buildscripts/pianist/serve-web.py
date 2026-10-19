"""Local-only Pianist server. Usage: python buildscripts/pianist/serve-web.py"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[2] / 'build.artifacts'
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Permissions-Policy', 'midi=(self), microphone=(), camera=()')
        super().end_headers()

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8787)
parser.add_argument('--directory', type=Path, default=ROOT, help='Build directory or staged release site')
args = parser.parse_args()
directory = args.directory.resolve()
if not (directory / 'MuseScoreStudio.wasm').is_file():
    raise SystemExit('Build the actual MuseScore WebAssembly engine first.')
server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(directory)))
print(f'Local: http://127.0.0.1:{args.port}/pianist.html', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
