# Current validation commands

Run commands from the repository root. The entrypoint writes an aggregate report
and per-step logs under `artifacts/checks/<UTC timestamp>-<mode>/` and exits nonzero
on failure. No grading algorithm or bank contents are changed by these checks.

## Fast source gate

Use Node 24 and Python 3.11. Install once:

```sh
npm ci --prefix apps/pianist-web --no-audit --no-fund
python -m pip install -r buildscripts/pianist/check-requirements.txt
python buildscripts/pianist/check-pianist.py fast
```

This verifies pinned converter/reference bytes, the active/reference/historical
tool inventory (`check-tooling.py`), static production dependency boundaries
(`check-dependencies.cjs`), application source formatting
(`npm run format:check` in `apps/pianist-web`), TypeScript types, every app unit
test (including the committed C# oracle comparisons and live Python R4/ABC
oracles), Python library/grade regressions, all 5,600 committed authored source
rows through the existing G1–G8 validators, and source cutover. The C# oracle
JSON is compared, not regenerated; no .NET, WASM, warehouse, downloaded corpus,
authored-bank output or submodule is required. Python oracle dependencies are
pinned in `check-requirements.txt`; upstream source bytes are already committed.

The dependency gate parses TypeScript/JS/TSX through the pinned Prettier parser,
including reexports, type imports and static worker URLs. App/package consumers
use public package indexes; packages cannot import the app; score contracts and
the practice engine cannot acquire UI/browser I/O dependencies. Tests/oracles may
inspect internals deliberately. Runtime native module URLs are verified by the
asset loader, not inferred by this static check.

`pianist-checks.yml` runs this gate on relevant PRs/pushes and manual dispatch.
Make the `fast` job required in GitHub branch protection separately. A successful
fast gate does **not** claim native audio, browser or native cutover acceptance.

## Native release gate

First build and package the optimized main engine, renderer, audio engine,
frontend, runtime and grade bank with the existing build pipeline. Install the
browser test dependencies and Microsoft Edge, then run:

```sh
npm ci --prefix tests/browser/pianist
python buildscripts/pianist/check-pianist.py native
```

This verifies `build.artifacts/release.json` and all listed assets, runs full
source/bundle/WASM cutover, prepares deterministic test inputs, starts its own
loopback server, and runs all critical browser suites **sequentially**. It stops
only its own server afterwards. It never downloads or builds a substitute WASM.
Use `--site path/to/staged/site --public` to check a public release candidate.

Critical suites cover native pauses/ties, playback synchronization, full native
sheet/mobile/A–B selection, import/export integrity, virtual piano/pedal PCM,
two-staff piano library admission and atomic rejection of invalid/batched imports,
fresh grade startup, practice/listen Stop, grade navigation and queue behavior,
and ABC/MXL MIDI simulation with loop/highlight/viewport parity. Hardware MIDI
and a physical mobile device remain separate acceptance tasks.

The native gate is deliberately manual on a machine with the packaged assets;
there is no GitHub job pretending a fresh source checkout includes the WASM.
Run it before `stage-release.py` and preserve its report with release evidence.
The report identifies both checked-out source and the tested package commit.

## Focused browser iteration

```sh
python buildscripts/pianist/check-pianist.py browser --suite practice-stop
python buildscripts/pianist/check-pianist.py browser --suite native-sheet-integrity --suite native-preview-grade
python buildscripts/pianist/check-pianist.py native --list
```

Browser iteration checks selected suites, not the complete release gate. It
requires an existing package. `--url http://127.0.0.1:8787/pianist.html` reuses a
server; its release version must match `--site`. Supply no query or hash: the
runner chooses the correct diagnostics/route for each suite. Edge is the current
explicit channel because several existing native tests require it.

`npm test --prefix tests/browser/pianist` now runs the critical browser set;
`test:legacy-m0` preserves the historical M0 smoke command under an explicit name.
Use the fast gate and native gate together for release acceptance.
