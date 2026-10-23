# CSS ownership and cascade

`../style.css` is the only entry for the historical global sheet. Its ordered imports reconstruct the pre-extraction rule stream exactly. Keep import order stable; moving a rule between layers is a separate visual change.

- `base.css`: reset, tokens and shared element primitives.
- `../app/`: shell and free-play/grade navigation.
- `../features/library/`, `../features/editor/`, `../features/results/`: their existing feature rules.
- `../practice/styles/piano.css`: live 88-key base styling, required by PracticePiano.
- `legacy-overrides.css`, `mobile-frame.css`, `editor-library-responsive.css`: cross-feature responsive/correction layers retained in their original order.
- `../practice/styles/legacy-layout.css`: previous practice layout selectors, retained until a separate coverage-backed removal. These are not the scoring implementation.

The current sheet-first practice styles remain in `../practice/practice-v2.css`; grade selection styles remain in `../exercises/exercises.css`. Their dependency import order is preserved by the application entry. Do not import the feature CSS again from each component: the ordered global entry already includes it.

No selector was deleted in this extraction. In particular, legacy overrides still contain live piano and results rules. A future cleanup must first relocate those rules with explicit cascade checks, then validate desktop/mobile/full-sheet rendering.
