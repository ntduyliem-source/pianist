# Practice V2 — source provenance and supported profile

The manifest pins 33 original files by Git blob and SHA-256. Files in the five source subdirectories are unchanged. Do not edit them to make a test pass: update pins explicitly and regenerate the independent corpus.

| Source | Pin | License | Use |
| --- | --- | --- | --- |
| [ppy/osu](https://github.com/ppy/osu/tree/676f3b01f28841ebd97ab583e178f2d7b99fe48c) | `676f3b01f28841ebd97ab583e178f2d7b99fe48c` | MIT, `osu/LICENCE` | BPM judgement |
| [ztbishop/piano-trainer-studio](https://github.com/ztbishop/piano-trainer-studio/tree/b40e412ccbc701094a9bb4bfe91ef45c32065704) | `b40e412ccbc701094a9bb4bfe91ef45c32065704` | AGPL-3.0, `piano-trainer-studio/LICENSE` | Wait functions |
| [erangithub/eran_reaper_jsfx](https://github.com/erangithub/eran_reaper_jsfx/tree/23bbc5c62c421fdd69dda7baca6609b704910ff6) | `23bbc5c62c421fdd69dda7baca6609b704910ff6` | GPL-3.0-or-later, source header/license | Independent beat/phase/offset expression checks |
| [mir-evaluation/mir_eval](https://github.com/mir-evaluation/mir_eval/tree/fe73b3533737814f83dbd9739f06e90f5f82f758) | `fe73b3533737814f83dbd9739f06e90f5f82f758` | MIT | Note-offset predicate and pedal interval maximum matching/P/R/F1/overlap |
| [magenta/note-seq](https://github.com/magenta/note-seq/tree/35825508885343fb06f93dc87ff491dbbf034505) | `35825508885343fb06f93dc87ff491dbbf034505` | Apache-2.0 | Sustain control application, repeated pitch, per-instrument separation |

## Symbol mapping

Source paths are relative to the original repositories. Destinations are relative to this repository. Extraction manifests contain exact function hashes in addition to full-file hashes here.

| Original symbol | Destination | Treatment |
| --- | --- | --- |
| `IBeatmapDifficultyInfo.DifficultyRange`, `ManiaHitWindows.updateWindows` | `packages/practice-engine-v2/upstream/mania.ts` `ManiaHitWindows` | Mechanical C# → TS port, modern Mania OD 0–10 |
| `HitWindows.ResultFor/CanBeHit` | same file, `resultFor/canBeHit` | Mechanical port, inclusive boundary |
| `DrawableNote.CheckForResult/OnPressed`, `DrawableHitObject.UpdateResult/ApplyResult` | same file, `ManiaKernel` | Headless port of eligibility, expiry and consumption |
| `OrderedHitPolicy.IsHittable/HandleHit`, `HitObjectContainer.Compare` / column dispatch | same file | MIDI pitch per lane, onset sort; prefix cursors optimize finished objects |
| `ScoreProcessor.GetBaseScoreForResult`, `ManiaScoreProcessor.GetBaseScoreForResult` | same file `BASE_SCORE`, `results.ts` | Original weights 0/50/100/200/300/305; normalized base-score accuracy |
| PTS `findExpectedMatchForMidi`, `findSatisfiedOrSustainedMatchForMidi`, `triggerVirtualKey`, `checkWaitModeAdvance` | `upstream/studio-wait.js` | Whole bodies extracted unchanged, explicit Wait-only host |
| `DrawableHoldNoteTail.GetCappedResult`, release expression, `TailNote.RELEASE_WINDOW_LENIENCE` | `upstream/hold-tail-probe.ts` and C# runner | Isolated test probe; not product duration scoring |
| JSFX beat period, phase wrap, offset expressions | `tests/reference-v2.test.ts` | Original arithmetic expressions; not whole REAPER or `isHit` |
| mir_eval `match_note_offsets` | `upstream/mir-eval.ts::offsetMatches/offsetTolerance` | Singleton offset predicate applied to the note already associated by osu; no new note matcher |
| mir_eval `match_notes`, `_bipartite_match`, `precision_recall_f1_overlap`, `f_measure`, `average_overlap_ratio` | `upstream/mir-eval.ts` | Mechanical port, Python dict order and NumPy round-to-even retained. Sparse enumeration skips only certainly-false onset pairs; source matching order unchanged |
| note-seq `apply_sustain_control_changes` and four event-order constants | `upstream/note-seq.ts::applySustain` | Whole event algorithm ported. Protobuf fields renamed; caller supplies instrument identity as port/channel |
| MuseScore `CompatMidiRender::renderScore`, `RepeatList`, pedal Spanner DOM | `practicesnapshot.cpp`, `reference-adapter-r4.ts` | Call existing native renderer; export identities/ticks/times, no handwritten articulation factors |

No Classic/Convert/clock-rate mods, bonus/tick/hold score, combo, rank or full osu total-score formula is claimed. No osu assets/UI are used. Extra presses do not lower upstream accuracy; the product reports them and input precision separately. Equal-onset same-pitch score notes are merged into one physical target before the kernel.

## Independent oracle and limits

`tests/reference-runners/osu/ReferenceRunner.csproj` compiles original full HitWindows/ManiaHitWindows/OrderedHitPolicy/difficulty sources and verbatim methods from `extract-reference-methods.py`. Host stubs supply clock, drawables/data, events and IO. They do not substitute a TS matcher for C#. The headless container supplies deterministic sorted dispatch. Original method text and `extractions.json` regenerate from pinned source.

329 scenarios run through that C# executable; the same 329 run again with the deterministic event-time host's expiry clock steps. These are **329 unique cases checked at two layers**, not 658 different musical cases. TS checks target ID, grade, delta, commit time, consumed sequence and extras. Boundary/dense/octave/chord assertions are also stated independently in the Python generator. 68 hold-tail cases only cover the extracted release expression/caps with supplied head-hit/body-break state.

The full osu application, upstream NUnit suites, PTS browser application and REAPER were **not** run. Upstream tests are reference material. Runner hosts and MIDI/clock/score adapters remain Pianist code with their own contracts/tests. The four PTS functions execute in production with mode `wait`, callbacks flushed after each input, DOM/audio disabled and no Follow/Realtime reservation. Wait latches played chord pitches; simultaneous holds are not required. The MIDI adapter filters duplicate physical Note On before the source function.

## Web adaptations, not grading inventions

- Native MuseScore supplies tick/tempo/repeat occurrence/anchor data. A new adapter resolves hand/voice, continuous ties, unison, A–B and loop identity.
- MIDI 1.0 Note On velocity zero is Note Off; CC64 ≥64 is on, state per device/channel. Sources: [message summary](https://midi.org/summary-of-midi-1-0-messages), [CC table](https://midi.org/midi-1-0-control-change-messages).
- [Web MIDI timestamps](https://www.w3.org/TR/webmidi/) refer to system receipt. Audio/performance mapping is fixed per start/resume and recorded. Offset is subtracted once. The 150 ms delivery bound is a transport limit: exceeding it interrupts, never widens hit windows or invents a wrong note.
- Automatic expiry uses the first representable time after the original Meh deadline. The C# event-host corpus receives those same steps so UI frames cannot change judgement time. Original source still decides hit/miss and notelock.
- Raw `soundOffMs` still means sustain-gate closure. R4 separately derives sounding offsets through note-seq, which cuts a repeated pitch at the new attack. Neither is an acoustic-decay measurement. No old release ratios/tolerance/arpeggio delays survive.

## R4 piano release and pedal profile

The source map and function-body SHA-256 values are in `r4-symbols.json`.
The independent runner `tests/reference-runners/r4/oracle.py` imports the original
mir_eval modules and compiles the complete, unchanged note-seq function AST.
Only protobuf data containers and the unquantized flag are supplied by its host.
It does not load product TypeScript. `reference-r4.test.ts` passes 535 deterministic
boundary/random cases to Python and compares results, including actual matching
pairs rather than F1 alone. This is not a run of the full Magenta training stack.

Note release uses mir_eval's default offset rule: absolute distance rounded to
4 decimals in seconds, inclusive comparison against max(0.2 × reference
duration, 0.05 seconds). Association is the existing osu judgement sequence.
The reference offset is MuseScore MIDI output, including its native articulation
gate times and ties; it is not a pedagogical claim that every pianist must play
one interpretation. Ambiguous/missing native release or expanded ornaments are
marked unavailable. No substitute percentage is guessed.

Pedal uses the profile demonstrated by
[piano_transcription calculate_score_for_paper.py, lines 270–284](https://github.com/bytedance/piano_transcription/blob/1ade7dcd4348add669a67c6e6282456c8c6633bd/pytorch/calculate_score_for_paper.py#L270):
mir_eval interval matching with constant pitches, onset tolerance 0.2 seconds,
offset ratio 0.2 and minimum offset tolerance 0.05 seconds. This source is a
parameter-selection reference only, not a vendored unlicensed implementation.
No neural inference model or trained weights are used. This is a reproducible
binary pedal timing profile, not a universal piano-expression score.

Reference pedal intervals come from explicit MuseScore pedal spanners, expanded
by the native repeat traversal, clipped to the selected segment and joined by
spanner identity only across contiguous visits. A new loop/cut starts fresh.
One piano part may use both staves. Multiple selected parts or no pedal marks
produce `no-reference`, not invented pedal instructions. The user's pedal toggle disables
sounding/pedal assessment and the virtual sustain voice while retaining raw
events; key-release assessment remains separately selectable. Wait has no
duration or pedal timing score.

Transport adaptations are explicit: milliseconds/seconds conversion, one common
origin for negative count-in timestamps, device/channel grouping, and censoring
synthetic/pause/stop closures. A forced boundary cannot certify a real release.
Partial/unreleased pedal recordings suppress the final F1 display. Natural
completion waits beyond all source-derived offset windows. No new weighted
composite mixes onset, duration and pedal. Pre-R4 results remain saved data;
the engine ID changes and only identical-version replays are executable.

## Reproduce

From the root, with Python, .NET 10 and locked npm dependencies:

```powershell
python buildscripts/pianist/prepare-reference-sources.py
python buildscripts/pianist/extract-reference-methods.py
python buildscripts/pianist/extract-wait-source.py
python buildscripts/pianist/reference-corpus.py
python -m pip install --target .tools/r4-python -r tests/reference-runners/r4/requirements.txt
npm --prefix apps/pianist-web test
npm --prefix apps/pianist-web run build
python buildscripts/pianist/audit-practice-cutover.py
```

The source archive includes these scripts, original files, licenses, generated output and tests. Preserve copyright/license notices. The PTS-derived Wait module remains AGPL-3.0; it is not relicensed GPL/MIT by placement in this tree. Supply corresponding combined application source/build instructions to network users as required by that license. The deployment bundle contains the exact clean Git archive. See `docs/THIRD_PARTY_NOTICES.md`.

## Two-staff admission and MPE reference upgrade (2026-10-24)

The production snapshot now also exports `performance.source = musescore-mpe`.
`practicesnapshot.cpp::playbackNotesFor` reads the same NoteEvents consumed by
FluidSequencer and used by listening highlights. It does not implement grace,
arpeggio, trill, tremolo, swing, tie or glissando timing. Those events come from
MuseScore's existing `ChordArticulationsRenderer`, `GraceChordCtx`,
`OrnamentsRenderer`, `ArpeggioRenderer`, `TremoloRenderer`, `NoteRenderer` and
`GlissandosRenderer`. `RepeatList::utime2utick` supplies tick evidence; native
time-map interpolation preserves sub-tick precision when converting BPM.
Grace notes now have their own stable anchor and SVG IDs.

`native-performance.ts` selects these events by hand/voice and contiguous A–B
visits, clips boundary holds, merges exact same-time same-pitch physical keys,
and hands targets to the unchanged osu/PTS kernels. Both Wait and BPM include
expanded ornament/grace attacks. Key offsets use MPE actualDuration; historical
snapshots retain their old CompatMidiRender data path. Missing MPE in a cached
complex score requests reopening the score; it does not blacklist the source.
The engine ID changes so previous attempts remain readable but are not replayed
under new target semantics.

`native-time.ts` converts native timing to the selected fixed BPM or scales the
score tempo map. Equal-tick native breakpoints represent pauses: score-tempo mode
retains their seconds, while fixed BPM omits them. The cursor uses that same
converted map. This is a timeline coordinate adapter, not a new hit window or
pitch matcher. The mir_eval and note-seq kernels and tolerances are unchanged.
Overlapping independent voices on the same physical key retain every attack;
an offset extending past the next strike is marked unavailable for key-hold
grading, rather than replacing the native duration with a guessed one.
Two piano parts' overlapping explicit pedal intervals are combined into one
physical pedal reference. Missing pedal releases are never inferred; no-reference
pedal results do not block note/BPM practice.

Admission is independent of grading complexity: valid two-staff sources are
retained, including native importer repairs/interpretations of ambiguous input.
Source discrepancies remain audit information. No guarantee is made that an
incomplete or contradictory MusicXML source equals an unavailable original score.
`tests/browser/pianist/two-staff-upgrade.cjs` compares library MPE grading references
against actual sample playback events, checks grace glyph mappings and captures
native inputs for the scoring integration test.
