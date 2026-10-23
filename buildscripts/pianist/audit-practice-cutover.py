"""Fail if an obsolete grader leaks into source, Worker, bundle or source map."""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-only',action='store_true',help='Check source only; explicitly exclude generated bundles and native WASM')
parser.add_argument('--build-directory',type=Path,default=ROOT/'build.artifacts')
args=parser.parse_args()
removed=['packages/practice-core/bpm.ts','packages/practice-core/wait.ts','packages/practice-core/plan.ts',
 'packages/practice-core/release.ts','packages/practice-core/results.ts','packages/practice-core/replay.ts','packages/practice-core/comparison.ts',
 'packages/practice-worker/practice.worker.ts','apps/pianist-web/src/practice/session.ts','apps/pianist-web/src/practice/feedback.ts',
 'apps/pianist-web/src/platform/calibration.ts','apps/pianist-web/src/platform/transport.ts','apps/pianist-web/src/platform/midi.ts']
for name in removed:
    assert not (ROOT/name).exists(),name
pattern=re.compile(r'practice-core[/\\]|practice-worker[/\\]|\bBpmCore\b|\bWaitCore\b|pianist-onset-1|\breleaseRatio\b|\breleaseUnsupported\b|\bperfectMs\b|\bgoodMs\b|\bwindowMs\b')
scanned=[]
folders=[ROOT/'apps/pianist-web/src',ROOT/'packages']
if not args.source_only:folders.append(args.build_directory.resolve()/'app')
for folder in folders:
    for p in folder.rglob('*'):
        if p.suffix not in ['.ts','.tsx','.js','.map']:continue
        text=p.read_text(encoding='utf-8')
        assert not pattern.search(text),str(p)
        scanned.append(p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p))
native=None
if not args.source_only:
    assert any((args.build_directory/'app').glob('*.js')),'Missing built application; build it before native cutover audit'
    native=(args.build_directory/'MuseScoreStudio.wasm').read_bytes()
    assert b'releaseRatio' not in native and b'releaseUnsupported' not in native,'stale native snapshot policy'
out={'obsoleteFilesAbsent':len(removed),'scannedFiles':scanned,'nativeChecked':native is not None,'nativeSha256':hashlib.sha256(native).hexdigest() if native else None,'obsoleteGraderMatches':0}
(ROOT/'artifacts/r0-r7').mkdir(parents=True,exist_ok=True)
(ROOT/('artifacts/r0-r7/cutover-source.json' if args.source_only else 'artifacts/r0-r7/cutover.json')).write_text(json.dumps(out,indent=2),encoding='utf-8')
scope='source only; native and generated bundles NOT checked' if args.source_only else 'source/build/map and native policy checked'
print(f'Cutover verified: {len(removed)} obsolete files absent, {len(scanned)} files clean; {scope}.')
