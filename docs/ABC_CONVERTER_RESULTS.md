# ABC converter verification — A1

Date: 2026-10-19. A1 passes **for the profile below**, using original Python
abc2xml 2.68 / xml2abc 1.77 and Pyodide 314.0.7. This does not certify arbitrary
ABC or lossless conversion of the entire MusicXML format.

## Evidence and reproduction

1. `python buildscripts/pianist/prepare-score-format-sources.py`
2. `python -X utf8 tests/reference-runners/abc/oracle.py`
3. `node tests/browser/pianist/build-abc-lab.mjs`
4. With the local server on port 8787: `node tests/browser/pianist/abc-converter.cjs`
5. In `apps/pianist-web`: `node --import tsx --test tests/score-formats.test.ts`

Local machine: Windows, Edge 155.0.4283.62, CPython and the actual browser Worker.
30 requests compared: **all browser results/diagnostics match CPython**; 23
accepted, seven explicitly rejected. Local Phố Xa participates when available;
its score and generated ABC are excluded from Git and public distribution.

Seven original ABC fixtures have hand-counted pitch/rational onset/duration,
tempo, tie, pedal and/or meter expectations. These detect shared upstream errors
instead of merely comparing the converter with itself. All seven reach native
MuseScore, a practice snapshot and SVG containing exact `data-practice-notes` IDs.

Six native source → ABC → native round trips are equivalent: M0 piano,
tempo-repeat-tie, volta, pedal-duration, same-staff-voices and special-symbols.
Comparison covers pitch, duration ticks, staff/voice, tie-back/articulations,
performed events, occurrences, beats, native key-off and pedal spans. Rational
fixture times are exact; native millisecond comparisons use <= 1e-6 ms.
Repeat-volta independently asserts occurrence order `[0,1,0,2]`.

Real Worker cancellation, conversion timeout, retry and sequential A/B/A calls
pass. Seven automated Node tests also cover UTF-8, BOM/CRLF, tunebook boundaries,
blocked file/script includes, oversize input, stale worker replies, boot timeout
and runtime errors. Full product lifecycle/backup and the complete ABC MIDI/A–B
matrix remain A3–A5; A1 reuses the current native pipeline without changing it.

Raw local evidence: `artifacts/abc/oracle.json`, `browser-results.json` and
`*-import-native.json`. The lab imports the same client/Worker that A2 uses; it
is a test harness, not a second product import path.

## Profile and rejected losses

| Feature | Result / policy |
| --- | --- |
| Piano grand staff, independent voices, unison, mixed-length chord | Supported in fixtures. Original upstream grand-staff grouping requires exactly one named voice in braces, or its `{* ...}` extension; unnamed braces may produce separate parts. |
| MIDI pitches A0–C8, key signatures, accidentals | Supported in fixtures. No automatic pitch transposition or octave repair. |
| Pickup, rests, dotted/broken rhythms, 6/8, tuplets, changing meter | Supported when upstream's integer durations remain exact. |
| Quarter/dotted-quarter `Q:`, tempo changes | Supported; converted through native tempo map, not a separate BPM algorithm. |
| Tie across bar, slur, staccato, repeated pitch | Supported in fixtures; native decides key release. |
| Simple repeat and first/second endings | Supported and checked against native occurrence order. |
| Pedal start/stop, across measures/repeat | Supported with `ped=True`; absent pedal stays absent. |
| Unicode, preamble, duplicate X/title, selecting tune by index | Converter supported. A2 intentionally accepts a single tune only; selection UI is A3. |
| Layout-only directives | Explicit allowlist becomes visible warnings, not silently dropped diagnostics. Layout is re-engraved by MuseScore. |
| 64th notes / any duration rounded by upstream | Rejected. Upstream hardcodes 2520 divisions and truncates some fractions. The adapter compares generated MusicXML duration with type/dots/time-modification exactly, then rejects mismatches; it never rounds or repairs them. |
| D.C./D.S./Coda/Fine | Rejected on ABC import. Native comparison demonstrated extra/wrong occurrences. No custom repeat interpretation added. |
| Cross-staff voice moves | Rejected on ABC import; native comparison demonstrated changed voice assignment. |
| Downward arpeggio in MusicXML → ABC | Rejected; xml2abc drops direction, reversing native attack/key-off order. Ordinary ABC arpeggio uses upstream/native semantics. |
| Malformed/unknown music, changed tie, illegal duration | Upstream diagnostics reject import. Syntax errors do not become partial projects. |
| Untested extensions, instrument-specific playback overrides | Not certified. Known losses are rejected; no claim that arbitrary third-party ABC is equivalent to an unavailable original score. |

Phố Xa is a **negative fidelity case**. The original converters report two ties
changed into slurs and illegal durations (`22/3`, `2/3`). Earlier inspection also
found 64th-note truncation. Its ABC must not be accepted as equivalent; open the
original MXL. This does not affect the existing MXL demo or practice engine.

An important upstream option discovered by comparison: `xml2abc` defaults `m=0`,
omitting MIDI instruments. That changed MuseScore note-offs even where pitch and
onset matched. Passing its documented `m=2` preserves instruments and the six
accepted native round trips match. An external ABC without instrument metadata
still uses MuseScore's default instrument; do not claim its key-off equals a
different original instrument.

## Cost and delivery

Five core runtime files: **13,531,207 bytes** raw, **6,325,376 bytes** with gzip
per file (local server currently serves raw). Two Python sources: 254,719 bytes.
The test Worker bundle is about 14.6 kB before gzip; production size is measured
again with A2. Runtime core omits Pyodide's optional package distribution.

Observed cold request: 3.27 s, including runtime boot; subsequent small fixture
imports: 80–103 ms wall time. Phố Xa export: 357 ms; rejected reimport: 710 ms.
These are one-machine observations, not promised browser performance. Reuse
keeps runtime warm within the page. Cancellation terminates it; retry reloads.

All runtime assets use the app origin and version/hash pins. MXL does not create
the Worker. A6 still needs release staging, source-bundle notices and explicit
offline preparation; a local staged runtime is not an offline-release claim.

References: [abc2xml source/documentation](https://wim.vree.org/svgParse/abc2xml.html),
[xml2abc options](https://wim.vree.org/svgParse/xml2abc.html),
[Pyodide Workers](https://pyodide.org/en/stable/usage/webworker.html).

## A2 — Product integration

Completed 2026-10-19. `prepareScoreFile` is the shared entry for file picker and
drop: validate source → pass native formats through, or prepare ABC → validate
generated MusicXML → existing native document import. Original ABC bytes stay in
`source/sourceName`; editable saved bytes are MSCZ. There is no alternate scorer.

`npm test`: **96/96**, no skipped tests. `npm run build`: TypeScript/Vite pass.
New tests cover source spoofing, XML entities, native bypass, source retention,
save/reopen without conversion, overlapping opens, cancellation/stale completion,
active-session guards and native failure preserving read-only practice mode.
The old scoring cutover audit passes: 13 obsolete files absent, zero old grader
matches in source, bundles/maps or native policy.

Real Edge UI: `node tests/browser/pianist/abc-import.cjs` passes. It checks MXL
does not fetch Python, imports ABC into the native editor, edits pitches,
undo/redo, saves MSCZ/MXL, reloads the library and saved MSCZ, rejects invalid,
rounded and multi-tune input without adding projects, cancels a blocked runtime
download, and imports by drag/drop with a visible layout warning.

The imported ABC then uses the separate practice view and the existing simulated
MIDI path: **11/11 perfect attacks, zero extras/misses, 11/11 correct key releases,
pedal F1 = 1**. Full-sheet mode shows the held native note glyphs during the run;
the practice file picker also opens ABC directly into its read-only view. This is the basic A2 end-to-end
check; the complete two-format A–B/fullscreen/camera/replay matrix remains A5.
Local artifacts: `artifacts/abc/a2/result.json`, `practice-result.json`, `results.png`.

The existing `m0-smoke.cjs` also passes on Edge: native MXL/XML import,
MSCZ/MXL reopen, keyboard editing/duration/note entry, and malformed XML retaining
the open score without aborting WASM (`artifacts/m0/msedge/result.json`).

Production app: 539.84 kB raw JS / 143.11 kB gzip, converter Worker 14.78 kB raw;
the separate practice Worker remains byte-identical at 16.11 kB. Native WASM and
the original grading algorithms were not changed. A3 multi-tune UI, A4 ABC export,
A5 complete practice equivalence and A6 offline/release work remain pending.

## A3 — Tunebook and durable source metadata

Implementation checkpoint, 2026-10-19. Node suite: **103/103**, including
atomic batch rollback on duplicate keys, quota exceptions and cancellation.
ABC selections convert completely before sequential native temporary projects
are prepared. No global score publication occurs until a single IndexedDB
transaction has committed all fresh identities. A post-commit open failure
explicitly reports that the imported scores are already saved.

Source bytes, SHA-256, tune index/ID/title, converter version and diagnostics
travel with each project. Backup manifest v2 validates these fields, source
hashes and tune identity; legacy v1 remains readable. Source duplication and
compiled output count toward a 128 MiB batch limit, with quota preflight.
The chooser defaults to one tune, reports errors by tune, and lets the user
deselect/retry or cancel. The native temporary-project/semantic capture API
is also the foundation for A4 fidelity checks.

Browser acceptance runner: `node tests/browser/pianist/abc-library.cjs`.
At this checkpoint its run is pending the optimized native build; later
acceptance results below supersede this checkpoint status.

A3 browser acceptance completed on Edge 155.0.4283.62: **7/7 groups pass**,
no page errors (`artifacts/abc/a3/result.json`). Actual native preparation of
the first tune followed by a failed second tune leaves the live score, revision,
undo and library unchanged. Reload recovery, independent copy edits, offline
opening of an already stored MSCZ with the engine loaded, backup/restore and
selected-tune practice all pass. The recovery test waits for the completed
transaction and accepts the native before-unload confirmation; it does not
reload while the UI merely says it is waiting to autosave. Fresh offline app
startup/conversion remains A6.
