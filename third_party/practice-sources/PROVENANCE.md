# Practice V2 — source provenance and supported profile

The manifest pins 26 original files by Git blob and SHA-256. Files in the three source subdirectories are unchanged. Do not edit them to make a test pass: update pins explicitly and regenerate the independent corpus.

| Source | Pin | License | Use |
| --- | --- | --- | --- |
| [ppy/osu](https://github.com/ppy/osu/tree/676f3b01f28841ebd97ab583e178f2d7b99fe48c) | `676f3b01f28841ebd97ab583e178f2d7b99fe48c` | MIT, `osu/LICENCE` | BPM judgement |
| [ztbishop/piano-trainer-studio](https://github.com/ztbishop/piano-trainer-studio/tree/b40e412ccbc701094a9bb4bfe91ef45c32065704) | `b40e412ccbc701094a9bb4bfe91ef45c32065704` | AGPL-3.0, `piano-trainer-studio/LICENSE` | Wait functions |
| [erangithub/eran_reaper_jsfx](https://github.com/erangithub/eran_reaper_jsfx/tree/23bbc5c62c421fdd69dda7baca6609b704910ff6) | `23bbc5c62c421fdd69dda7baca6609b704910ff6` | GPL-3.0-or-later, source header/license | Independent beat/phase/offset expression checks |

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
- Pedal is raw sustain-gate state, not acoustic decay, piano phrasing or half-pedal. No old release ratios/tolerance/arpeggio delays survive. Piano-expression scoring remains unsupported pending a suitable source/specification and independent musical corpus.

## Reproduce

From the root, with Python, .NET 10 and locked npm dependencies:

```powershell
python buildscripts/pianist/prepare-reference-sources.py
python buildscripts/pianist/extract-reference-methods.py
python buildscripts/pianist/extract-wait-source.py
python buildscripts/pianist/reference-corpus.py
npm --prefix apps/pianist-web test
npm --prefix apps/pianist-web run build
python buildscripts/pianist/audit-practice-cutover.py
```

The source archive includes these scripts, original files, licenses, generated output and tests. Preserve copyright/license notices. The PTS-derived Wait module remains AGPL-3.0; it is not relicensed GPL/MIT by placement in this tree. Supply corresponding combined application source/build instructions to network users as required by that license. The deployment bundle contains the exact clean Git archive. See `docs/THIRD_PARTY_NOTICES.md`.
