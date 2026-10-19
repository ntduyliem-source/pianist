# Original ABC converters

These files are verbatim release archives, not a fork of the notation algorithms.
`manifest.json` pins archive URLs, SHA-256 and every extracted file. Git disables
line-ending conversion for this directory so verification works on Windows.

| Component | Version | Original release |
| --- | --- | --- |
| Willem G. Vree abc2xml | 2.68 | https://wim.vree.org/svgParse/abc2xml.py-268.zip |
| Willem G. Vree xml2abc | 1.77 | https://wim.vree.org/svgParse/xml2abc.py-177.zip |
| Pyodide | 314.0.7 | https://registry.npmjs.org/pyodide/-/pyodide-314.0.7.tgz |

The converter source headers grant the **Lesser GNU General Public License**
without selecting a version. Do not mislabel them as exclusively LGPL-2.1 or
LGPL-3.0. Both license texts and GPL-3.0 are included under `licenses/` alongside
the original Pyodide license/notices. Pyodide's LICENSE was fetched from its
314.0.7 tag: https://github.com/pyodide/pyodide/blob/314.0.7/LICENSE.

Run `python buildscripts/pianist/prepare-score-format-sources.py` to verify the
checked-in converters, fetch the pinned runtime archive into `.tools/`, and
stage only the five required core files and notices in `build.artifacts/score-formats`.
The Worker verifies all executable runtime and Python bytes before loading them.
It never fetches a CDN or sends scores to a conversion service.

The I/O adapter is `packages/score-formats/python/converter.py`. It calls:

- `abc2xml.getXmlDocs(text, skip=index, num=1)` and `getInfo()`; the old
  `getXmlScores()` wrapper does not forward tune-selection arguments.
- `xml2abc.vertaal(text, ped=True, p='', wev=True, m=2)` and its returned log.
  `m=2` retains MIDI instrument data, which affects MuseScore's native note-off
  timing. `ped=True` is necessary because the library default differs from CLI.

Each call creates fresh upstream module globals. The adapter validates input,
output, diagnostics and the supported profile; it does not modify upstream
parser/conversion code or correct lossy events. See `docs/ABC_CONVERTER_RESULTS.md`.
