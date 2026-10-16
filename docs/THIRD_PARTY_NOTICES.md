# Distribution notices — Pianist Web

Pianist is a downstream modification of MuseScore Studio v4.7.5,
base commit `3654226c2e99289916916953a98e585a3d3b315a`.
The source and modifications use the repository's [GPL-3.0 license](../LICENSE.txt).
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
| Vite / tsx / TypeScript and test dependencies | Build/test tools; their package licenses remain in their source distributions |

The local Phố Xa arrangement supplied for testing is not included in the public
source repository. The original piano template and practice fixtures added by
this project are CC0, as stated in their adjacent README/source comments.

This file records the software inventory, not a completed redistribution audit.
`buildscripts/pianist/prepare-notices.py` copies the installed React, React DOM,
scheduler and fflate license texts, plus Qt's five vendor-supplied SPDX documents
and extracted license texts, into `build.artifacts/notices/`. Its inventory is
included in the hashed offline release. Font and soundfont notices are copied
by the native web installer. This collection does not replace verification of
the complete linked dependency graph or availability of corresponding source.
Public release remains gated on a complete upstream/Qt/dependency notice and
corresponding-source check for the exact optimized artifact being distributed.
