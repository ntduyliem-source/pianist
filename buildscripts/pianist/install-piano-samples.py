"""Install the pinned, single-velocity Salamander piano (30 MP3s, A0-C8)."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads(Path(__file__).with_name('piano-samples.json').read_text(encoding='utf-8'))
out = ROOT / 'build.artifacts/sound/piano'
out.mkdir(parents=True, exist_ok=True)

def install(file):
    path = out / file['path']
    data = path.read_bytes() if path.exists() else b''
    if len(data) != file['bytes'] or hashlib.sha256(data).hexdigest() != file['sha256']:
        url = f"https://raw.githubusercontent.com/tambien/Piano/{manifest['commit']}/audio/{file['path']}"
        request = urllib.request.Request(url, headers={'User-Agent': 'Pianist-build'})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
        if len(data) != file['bytes'] or hashlib.sha256(data).hexdigest() != file['sha256']:
            raise ValueError('Piano sample hash mismatch: ' + file['path'])
        path.write_bytes(data)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(install, manifest['files']))
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(out / 'NOTICE.txt').write_text('Salamander Grand Piano v3 — Alexander Holm. CC BY 3.0.\n'
    'MP3 conversions distributed by Yotam Mann / tambien/Piano.\n'
    'https://github.com/tambien/Piano\nhttps://creativecommons.org/licenses/by/3.0/\n'
    'Single velocity layer (v8); original sample bytes retained.\n', encoding='utf-8')
print(f"Installed {len(manifest['files'])} piano samples, {sum(f['bytes'] for f in manifest['files'])} bytes.")
