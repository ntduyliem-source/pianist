"""Fail if an obsolete grader leaks into source, Worker, bundle or source map."""
from pathlib import Path
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[2]
removed=['packages/practice-core/bpm.ts','packages/practice-core/wait.ts','packages/practice-core/plan.ts',
 'packages/practice-core/release.ts','packages/practice-core/results.ts','packages/practice-core/replay.ts','packages/practice-core/comparison.ts',
 'packages/practice-worker/practice.worker.ts','apps/pianist-web/src/practice/session.ts','apps/pianist-web/src/practice/feedback.ts',
 'apps/pianist-web/src/platform/calibration.ts','apps/pianist-web/src/platform/transport.ts','apps/pianist-web/src/platform/midi.ts']
for name in removed:
    assert not (ROOT/name).exists(),name
pattern=re.compile(r'practice-core[/\\]|practice-worker[/\\]|\bBpmCore\b|\bWaitCore\b|pianist-onset-1|\breleaseRatio\b|\breleaseUnsupported\b|\bperfectMs\b|\bgoodMs\b|\bwindowMs\b')
scanned=[]
for folder in ['apps/pianist-web/src','packages','build.artifacts/app']:
    for p in (ROOT/folder).rglob('*'):
        if p.suffix not in ['.ts','.tsx','.js','.map']:continue
        text=p.read_text(encoding='utf-8')
        assert not pattern.search(text),str(p)
        scanned.append(p.relative_to(ROOT).as_posix())
native=(ROOT/'build.artifacts/MuseScoreStudio.wasm').read_bytes()
assert b'releaseRatio' not in native and b'releaseUnsupported' not in native,'stale native snapshot policy'
out={'obsoleteFilesAbsent':len(removed),'scannedFiles':scanned,'nativeSha256':hashlib.sha256(native).hexdigest(),'obsoleteGraderMatches':0}
(ROOT/'artifacts/r0-r7').mkdir(parents=True,exist_ok=True)
(ROOT/'artifacts/r0-r7/cutover.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(f'Cutover verified: {len(removed)} obsolete files absent, {len(scanned)} source/build/map files clean, native policy removed.')
