# Mobile editor and native practice listening

The practice score remains read-only. Listening and a graded attempt are mutually
exclusive. This change does not alter `packages/practice-engine-v2`, the grading
worker, `controller-v2.ts`, or the practice audio/input clock.

## Upstream playback entry points

`src/web/appjs/webapi.cpp` exposes a separate, guarded practice listening API.
It uses the loaded MuseScore sequence and MS Basic:

- `INotationPlayback::setTempoMultiplier`, the native tempo-map operation used
  by `PlaybackController::setTempoMultiplier` in
  `src/playback/internal/playbackcontroller.cpp`. The practice adapter owns the
  pause/prepare/resume lifecycle, so its generation guard can cancel a pending
  resume on stop/navigation. Calling the editor controller's wrapper here would
  leave an uncancellable asynchronous resume after a stop.
- `INotationPlayback::sendEventsForChangedTracks`, then
  `IPlayer::prepareToPlay` and `play`, as in `PlaybackController::togglePlay/play`.
- `IPlayer::seek`, `pause`, `stop`, `setDuration`, `setLoop`, `resetLoop` from
  `src/framework/audio/main/iplayer.h`.
- The same `setLoop` call used by `PlaybackController::updateLoop`.
  `src/framework/audio/engine/internal/clock.cpp` handles both loop return and
  stopping at the selected end, on the audio clock. JavaScript does not schedule
  notes or detect the end of a loop.

The former oscillator-based `score-preview.ts` is removed. The practice clock
used by graded attempts is unchanged.

Preparing playback is asynchronous. A generation counter cancels a pending
prepare after pause, stop, reset or navigation, preventing delayed audio startup
after leaving the view.
`Playback::player` is a factory: the bridge retains its player/subscriptions for
the current sequence, and reads the shared playback state as the editor does.
The Listen button waits for the controller's `isPlayAllowed` readiness.

## Time and selection

The snapshot's performed occurrences define listening boundaries. A–B starts at
the first native occurrence in the selected measure range and continues through
contiguous occurrences inside that range. It stops at the first occurrence
outside the range; disjoint visits are never joined across outside measures.
Repeats wholly contained in the selected range remain MuseScore's traversal.
Whole-score listening uses the full native traversal. The listening loop switch
repeats that segment until stopped; it is separate from the finite graded loops.

Listening speed is a multiplier of the written tempo, including tempo changes.
It is deliberately separate from the exercise's fixed/score BPM choice.
Position and seek are converted between native seconds at the current multiplier
and snapshot milliseconds at written tempo. Native performed note IDs/times drive
glyph highlighting and the existing sheet camera.

Reset restores the written tempo map and full player duration. Entering/exiting
practice continues to preserve the editor's playback speed and restores its loop
using `PlaybackController::updateLoop`'s native tick-to-time conversion. Starting a graded
attempt stops/resets listening first; snapshot capture also resets listening.
The editor action and MIDI notation-entry guards remain enabled throughout.
Listening never instantiates a grading worker or writes a practice result.

## Responsive layout

The web-specific QML shell has a 320 px minimum window width. Below 900 px,
Palettes/Layout/Properties overlay the score instead of reserving a 300 px column.
The native menu and note-entry bar scroll horizontally; the duplicate native
playback toolbar is hidden because the accessible web transport remains present.
Desktop panels, menus and the native renderer remain available.

Mobile file actions move into a dialog. Editor transport and Qt canvas use shared
header offsets. Controls account for display safe areas.

Practice defaults to a collapsed keyboard and a compact feedback summary. The
primary bar contains practice, listening, pedal, settings and full sheet. The
full-sheet bar retains listening and the pedal switch; hiding it leaves a reveal
button. In full sheet, seek/speed/loop controls move into Settings so only one
bar occupies the score viewport. Pedal grading configuration remains locked
during an attempt, as before.

Automatic score zoom preserves at least the native display width instead of
shrinking every printed system onto a phone. The existing camera pans both axes;
manual scrolling suspends follow until the user resumes it. Fit-width and manual
zoom remain available. This is viewport presentation, not score re-engraving.

## Validation

- `npm test` in `apps/pianist-web`: scoring/oracle tests plus native occurrence,
  range and bridge isolation checks.
- `tests/browser/pianist/mobile-native-audition.cjs`: real Qt/WASM editor, six
  viewport sizes, touch-control bounds, saving, a passive AudioWorklet analyser
  for actual native sample output, pause/seek/speed/native loop, one-shot end,
  stop during playback/tempo restoration, reference/history
  isolation, full-sheet pedal controls and simulated MIDI after listening.
- `tests/browser/pianist/mobile-editor-touch.cjs`: portrait touch selection,
  duration change through the native toolbar, and native Undo with full note
  comparison. No synthetic editor actions are substituted for these gestures.
- `tests/browser/pianist/abc-practice-ui.cjs`: ABC/MXL, three graded A–B loops,
  glyph highlighting, camera return, replay, timing error and Wait semantics.
- `tests/browser/pianist/editor-playback-library.cjs`: native editor transport,
  edit/play, navigation, tempo isolation and curated library.
- `buildscripts/pianist/audit-practice-cutover.py`: obsolete grading audit.

Browser mobile tests use touch/viewport emulation, not physical iOS/Android or a
real MIDI instrument. Those remain separate hardware checks.
