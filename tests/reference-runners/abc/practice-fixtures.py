"""Prepare local A5/A7 inputs using the pinned converters, never a new parser."""
from pathlib import Path
from fractions import Fraction
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'packages/score-formats/python'))
from converter import convert
from musicxml_summary import summary

out = ROOT / 'artifacts/abc/a5'
out.mkdir(parents=True, exist_ok=True)
abc = (ROOT / 'tests/fixtures/pianist/practice/abc-loops.abc').read_text(encoding='utf-8')
result = convert({'operation': 'abc-to-xml', 'text': abc})
assert result['ok'], result
music = summary(result['text'])
# Hand-counted composition: one 3-note RH chord, 30 RH quarters, 16 LH halves;
# 16 bars of 2/4, four marked pedal spans, no ties or articulation.
assert len(music['notes']) == 49
assert sum(n[3] == 1 for n in music['notes']) == 33
assert sum(n[3] == 2 for n in music['notes']) == 16
assert max(Fraction(n[0]) + Fraction(n[2]) for n in music['notes']) == 32
assert music['pedals'] == [[str(n), kind] for n, kind in [(0, 'start'), (8, 'stop'), (8, 'start'), (16, 'stop'), (16, 'start'), (24, 'stop'), (24, 'start'), (32, 'stop')]] or sorted(music['pedals']) == sorted([[str(n), kind] for n, kind in [(0, 'start'), (8, 'stop'), (8, 'start'), (16, 'stop'), (16, 'start'), (24, 'stop'), (24, 'start'), (32, 'stop')]])
(out / 'abc-loops.musicxml').write_text(result['text'], encoding='utf-8')
cases = json.loads((ROOT / 'artifacts/abc/oracle.json').read_text(encoding='utf-8'))
pho = next((c for c in cases if c['name'] == 'pho-xa-export' and c['expected']['ok']), None)
if pho:
    # Local evidence only; this copyrighted source/derivative never enters Git/site.
    (out / 'pho-xa-unverified.abc').write_text(pho['expected']['text'], encoding='utf-8')
print(json.dumps({'longFixtureNotes': 49, 'bars': 16, 'phoXaLocalAvailable': bool(pho)}))
