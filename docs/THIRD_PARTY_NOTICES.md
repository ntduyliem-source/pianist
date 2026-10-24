# Distribution notices — Pianist Web

Pianist is a downstream modification of MuseScore Studio v4.7.5,
base commit `3654226c2e99289916916953a98e585a3d3b315a`.
The MuseScore source and fork modifications use the repository's [GPL-3.0 license](../LICENSE.txt).
The new practice module also includes AGPL-3.0 material from Piano Trainer
Studio and MIT material from osu!; these retain their original licenses.
The fork and build scripts must accompany a distributed release through the
corresponding source/build instructions.

The following components are included in the software/build workflow:

| Component | Notice/source |
| --- | --- |
| MuseScore engine and upstream dependencies | Root license, source headers and upstream third-party directories |
| Qt 6.10.2 WebAssembly | Qt distribution licenses and corresponding Qt source for the pinned build; review static-link distribution before public release |
| MuseScore fonts (including Edwin, Leland, Bravura and others) | Individual licenses in `fonts/`; packaging copies the supplied font notices |
| Noto Sans CJK SC score-text fallback | SIL Open Font License 1.1; unmodified font and exact upstream revision in `fonts/noto-cjk/`, license distributed under `notices/fonts/noto-cjk/` |
| Plus Jakarta Sans / Newsreader UI fonts | SIL Open Font License 1.1; original notices in `apps/pianist-web/src/assets/fonts/`, distributed under `notices/fonts/studio/` |
| MS Basic soundfont | `share/sound/MS Basic_License.md` and `MS Basic_Readme.md`, copied beside the soundfont |
| React / React DOM / scheduler | MIT; versions and integrity in `apps/pianist-web/package-lock.json` |
| fflate | MIT; version and integrity in the same lockfile |
| abc2xml 2.68 / xml2abc 1.77 | Original Willem G. Vree Python sources, LGPL version unspecified by the source headers; release URLs, hashes and verbatim license texts in `third_party/score-format-sources/` |
| Pyodide 314.0.7 / CPython 3.14.2 | Same-origin minimal runtime, MPL-2.0 and the supplied Python PSF/history notices; pinned archive/core files and source links in the same directory. No optional Python packages are loaded. |
| osu!lazer / osu!mania judgement port | MIT, commit `676f3b01f28841ebd97ab583e178f2d7b99fe48c`; original copyright/license and source in `third_party/practice-sources/osu/` |
| Piano Trainer Studio Wait functions | AGPL-3.0, commit `b40e412ccbc701094a9bb4bfe91ef45c32065704`; unchanged function bodies plus adapted host in `packages/practice-engine-v2/upstream/studio-wait.js` |
| MIDI Rhythm Trainer reference expressions | GPL-3.0-or-later, commit `23bbc5c62c421fdd69dda7baca6609b704910ff6`; reference/test source only, not a production matcher |
| mir_eval offset and pedal metrics | MIT, commit `fe73b3533737814f83dbd9739f06e90f5f82f758`; source/license in `third_party/practice-sources/mir_eval`, port and independent Python runner |
| Magenta note-seq sustain | Apache-2.0, commit `35825508885343fb06f93dc87ff491dbbf034505`; modified/ported `apply_sustain_control_changes`, original files and license in `third_party/practice-sources/note-seq` |
| Vite / tsx / TypeScript and test dependencies | Build/test tools; their package licenses remain in their source distributions |

The local Phố Xa arrangement supplied for testing is not included in the public
source repository. The original piano template and practice fixtures added by
this project are CC0, as stated in their adjacent README/source comments.

This file records the software inventory, not a completed redistribution audit.
The [practice provenance map](../third_party/practice-sources/PROVENANCE.md)
identifies exact symbols, modifications and reference-runner limits. The app's
About dialog links the PTS license and application source. Public deployment
must offer the exact corresponding application source, including the adapted
Wait host and build scripts, to network users; merely naming the upstream
repository is not a substitute. The prepared deployment bundle supplies that
clean-commit archive under `source/`; follow `DEPLOY.txt` to make it available.
`buildscripts/pianist/prepare-notices.py` copies tracked LICENSE/COPYING/NOTICE
files with source paths and SHA-256, along with the installed React, React DOM,
scheduler and fflate license texts, plus Qt's five vendor-supplied SPDX documents
and extracted license texts, into `build.artifacts/notices/`. Its inventory is
included in the hashed offline release. Font and soundfont notices are copied
by the native web installer. This collection does not replace verification of
the complete linked dependency graph or availability of corresponding source.
Public release remains gated on a complete upstream/Qt/dependency notice and
corresponding-source check for the exact optimized artifact being distributed.

ABC converter source, the Python I/O adapter, original licenses and the minimal
Pyodide core are included under `site/score-formats/`; the exact app/source
archive contains the pinned upstream files and reproducible downloader.
`prepare-notices.py` also lists the converter/runtime notices and pin manifest
under `notices/score-formats/`. Runtime bytes are verified before execution;
release verification checks their hashes against those pins.

`stage-release.py` creates a source archive from the exact clean Git commit,
records its SHA-256 in `SOURCE.json`, and supplies the locked build scripts and
dependency metadata. Qt source is identified at
[Qt 6.10.2 source distribution](https://download.qt.io/official_releases/qt/6.10/6.10.2/single/).
The light piano output uses Tone.js 14.9.17 and @tonejs/piano 0.2.1 (MIT), with
the Salamander Grand Piano v3 samples by Alexander Holm (CC BY 3.0), distributed
by tambien/Piano. The 30 original MP3 sample hashes and upstream commit are
pinned in buildscripts/pianist/piano-samples.json. Full attribution ships in
sound/piano/NOTICE.txt; runtime licenses ship in notices/javascript/.

This bundle does not claim to contain the full Qt SDK/source or prove the whole
static linked dependency graph. Review against
[Qt's open-source distribution obligations](https://www.qt.io/development/open-source-lgpl-obligations)
before a public distribution. No hosting or public release has been performed.

The pinned @tonejs/piano 0.2.1 patch in apps/pianist-web/patches forwards sampler
load errors and disposes sampler/components; it does not change note/pedal algorithms.
