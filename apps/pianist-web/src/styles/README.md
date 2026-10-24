# CSS ownership and cascade

The current visual design is owned by `studio.css`, imported last. It adapts the user-supplied `Pianist-UI-Gemini.html`: self-hosted Jakarta/Newsreader fonts, light/dark tokens, desktop tabs/mobile bottom navigation, library cards, the standalone practice command bar, grade selection, dialogs and results. The imports split ownership between `studio-foundations.css`, `app/studio-shell.css`, `features/library/studio-library.css`, `practice/studio-practice.css` and `studio-panels.css`. Make visual changes in those owners; do not add screen-specific overrides to the old theme layer. Legacy layers retain the native editor sizing, notation/ink geometry, gesture handling and 88-key geometry. The HTML reference's simulated music, score, timing and statistics are not used.

`../style.css` is the only entry for the historical global sheet. Its ordered imports reconstruct the pre-extraction rule stream exactly. Keep import order stable; moving a rule between layers is a separate visual change.

- `base.css`: reset, tokens and shared element primitives.
- `theme.css`: shared light/dark tokens, native-compatible shell colors and persistent header MIDI/theme controls. Loaded after legacy layers.
- `../features/library/library-v2.css`: compact list/small/large layouts, real score thumbnails, version controls and shared audition player. Loaded last for the upgraded library.
- `../app/`: shell and free-play/grade navigation.
- `../features/library/`, `../features/editor/`, `../features/results/`: their existing feature rules.
- `../practice/styles/piano.css`: live 88-key base styling, required by PracticePiano.
- `legacy-overrides.css`, `mobile-frame.css`, `editor-library-responsive.css`: cross-feature responsive/correction layers retained in their original order.
- `../practice/styles/legacy-layout.css`: previous practice layout selectors, retained until a separate coverage-backed removal. These are not the scoring implementation.

The current sheet-first practice styles remain in `../practice/practice-v2.css`; grade selection styles remain in `../exercises/exercises.css`. Their dependency import order is preserved by the application entry. Do not import the feature CSS again from each component: the ordered global entry already includes it.

No selector was deleted in this extraction. In particular, legacy overrides still contain live piano and results rules. A future cleanup must first relocate those rules with explicit cascade checks, then validate desktop/mobile/full-sheet rendering.
