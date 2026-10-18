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
| MS Basic soundfont | `share/sound/MS Basic_License.md` and `MS Basic_Readme.md`, copied beside the soundfont |
| React / React DOM / scheduler | MIT; versions and integrity in `apps/pianist-web/package-lock.json` |
| fflate | MIT; version and integrity in the same lockfile |
| osu!lazer / osu!mania judgement port | MIT, commit `676f3b01f28841ebd97ab583e178f2d7b99fe48c`; original copyright/license and source in `third_party/practice-sources/osu/` |
| Piano Trainer Studio Wait functions | AGPL-3.0, commit `b40e412ccbc701094a9bb4bfe91ef45c32065704`; unchanged function bodies plus adapted host in `packages/practice-engine-v2/upstream/studio-wait.js` |
| MIDI Rhythm Trainer reference expressions | GPL-3.0-or-later, commit `23bbc5c62c421fdd69dda7baca6609b704910ff6`; reference/test source only, not a production matcher |
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

`stage-release.py` creates a source archive from the exact clean Git commit,
records its SHA-256 in `SOURCE.json`, and supplies the locked build scripts and
dependency metadata. Qt source is identified at
[Qt 6.10.2 source distribution](https://download.qt.io/official_releases/qt/6.10/6.10.2/single/).
This bundle does not claim to contain the full Qt SDK/source or prove the whole
static linked dependency graph. Review against
[Qt's open-source distribution obligations](https://www.qt.io/development/open-source-lgpl-obligations)
before a public distribution. No hosting or public release has been performed.
