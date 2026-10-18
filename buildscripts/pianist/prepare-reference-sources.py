"""Pin upstream bytes. No implementation from the retired Pianist grader is used."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'third_party/practice-sources'
SOURCES = {
    'mir_eval': ('mir-evaluation/mir_eval', 'fe73b3533737814f83dbd9739f06e90f5f82f758', 'MIT', [
        'LICENSE.txt', 'mir_eval/transcription.py', 'mir_eval/util.py', 'tests/test_transcription.py',
    ]),
    'note-seq': ('magenta/note-seq', '35825508885343fb06f93dc87ff491dbbf034505', 'Apache-2.0', [
        'LICENSE', 'note_seq/sequences_lib.py', 'note_seq/sequences_lib_test.py',
    ]),
    'osu': ('ppy/osu', '676f3b01f28841ebd97ab583e178f2d7b99fe48c', 'MIT', [
        'LICENCE', 'osu.Game/Beatmaps/IBeatmapDifficultyInfo.cs',
        'osu.Game/Rulesets/Scoring/HitWindows.cs', 'osu.Game/Rulesets/Scoring/HitResult.cs',
        'osu.Game/Rulesets/Scoring/ScoreProcessor.cs',
        'osu.Game/Rulesets/Objects/Drawables/DrawableHitObject.cs',
        'osu.Game/Rulesets/UI/HitObjectContainer.cs',
        'osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs',
        'osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs',
        'osu.Game.Rulesets.Mania/UI/OrderedHitPolicy.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableNote.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableManiaHitObject.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableHoldNote.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableHoldNoteHead.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableHoldNoteTail.cs',
        'osu.Game.Rulesets.Mania/Objects/Drawables/DrawableHoldNoteBody.cs',
        'osu.Game.Rulesets.Mania/Judgements/HoldNoteJudgementResult.cs',
        'osu.Game.Rulesets.Mania/Objects/TailNote.cs',
        'osu.Game.Rulesets.Mania.Tests/TestSceneOutOfOrderHits.cs',
        'osu.Game.Rulesets.Mania.Tests/TestSceneHoldNoteInput.cs',
    ]),
    'piano-trainer-studio': ('ztbishop/piano-trainer-studio', 'b40e412ccbc701094a9bb4bfe91ef45c32065704', 'AGPL-3.0', [
        'LICENSE', 'js/trainer-core.js', 'js/feedback-engine.js', 'js/trainer-timing.js',
    ]),
    'eran_reaper_jsfx': ('erangithub/eran_reaper_jsfx', '23bbc5c62c421fdd69dda7baca6609b704910ff6', 'GPL-3.0-or-later', [
        'LICENSE', 'midi_rhythm_trainer',
    ]),
}


def prepare():
    manifest = {'format': 1, 'sources': []}
    for name, (repo, commit, license_name, paths) in SOURCES.items():
        cached = ROOT / 'artifacts/reference-audit-2026-10-18' / name
        tree = json.loads((cached / 'tree.json').read_text()) if (cached / 'tree.json').exists() else json.loads(
            urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1', headers={'User-Agent': 'Pianist-reference-build'})).read())
        blobs = {e['path']: e['sha'] for e in tree['tree'] if e['type'] == 'blob'}
        files = []
        for path in paths:
            target = DEST / name / path
            local = target if target.exists() else cached / path
            data = local.read_bytes() if local.exists() else urllib.request.urlopen(f'https://raw.githubusercontent.com/{repo}/{commit}/{path}').read()
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if blob != blobs[path]:
                raise ValueError(f'Upstream content mismatch: {repo}/{path}')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            files.append({'path': path, 'gitBlob': blob, 'sha256': hashlib.sha256(data).hexdigest()})
        manifest['sources'].append({'name': name, 'repository': repo, 'commit': commit, 'license': license_name, 'files': files})
    (DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(f'Verified {sum(len(s["files"]) for s in manifest["sources"])} pinned source files.')


if __name__ == '__main__':
    prepare()
