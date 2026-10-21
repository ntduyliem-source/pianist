# Q2 semantic fixtures

The 12 short MusicXML files are original synthetic tests, released under CC0-1.0.
They are not excerpts from the downloaded music corpus and do not count toward
curriculum coverage. `tests/curriculum/fixtures_q2.py` reproduces their bytes.

`q2-golden.json` contains music21 analyses and actual native MuseScore semantics
for three originals. Its engine hashes identify the Q0 optimized build. It is
used for fast mutation regressions of the admission gate, not as a substitute
for the live native test.

Reproduce all live comparisons:

```powershell
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/prepare-q2-fixtures.py
node tests/browser/pianist/q2-native.cjs --jobs artifacts/q2-fixtures/jobs.json
```

The local preview must serve the current native build at port 8787. Override
`PIANIST_URL` and `PIANIST_BROWSER_CHANNEL` if needed. Test harnesses are not
product routes and are not included in a web release.

Positive gates: spelling (including C–C♯ versus C–D♭), accidental changes at
barlines, rational triplets, backup/forward with multiple voices, tie/unison
merging, clef changes, 8va, pedal offsets and changes. Clef and 8va fixtures
also inspect the actual temporary MSCZ saved by native MuseScore.

Negative gates: an overlong backup, an unfinished tie, unequal durations inside
one MusicXML chord, and grace notes. These must not enter fragment review.

Unfinished ties can have matching note rows while remaining blocked structurally.
Equal pitch/tick rows alone are insufficient evidence for admission.
