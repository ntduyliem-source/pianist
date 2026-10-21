# PianoPlayer used by offline K3

Source: https://github.com/marcomusy/pianoplayer/tree/6fb0e2114d7b21f75c0be5208172e1243a57323e

MIT, Copyright (c) 2017 Marco Musy. The original license is included.

`pianoplayer/hand.py`, `models.py` and `__init__.py` are exact original files.
`routing.py` contains the complete unchanged `_resolve_musicxml_routing`
function from `core.py`; only its required imports/logger are supplied locally.
`UPSTREAM.json` records their hashes and the original core source hash.

The local adapter supplies source-mapped, tie-merged notes with exact durations
converted to seconds at a single 60 quarter-BPM input. It keeps written finger
anchors, records all suggested fingers, and verifies conservative fixed-position
conditions. It never modifies the original MXL or the optimizer formula.

The historical evidence adapter retains upstream automatic depth, hand size M
and 60 quarter BPM. A trial of the documented manual depth=5 setting was stopped:
the pinned implementation can return zero fingers at its look-ahead tail. The
regression fixture records this; the vendored optimizer has not been modified.
The current reading-bank exporter does not call this optimizer at all. It uses
only the unchanged source-staff routing function, followed by ambiguity checks.

PianoPlayer's effort score is a model output, not a piano-learning grade or a
validated speed limit. Its onset-based cost is not evidence that a held finger
has been released. K3 keeps source integrity/held-note checks and does not use
this model to approve shifts, leaps, complex fingering or pedagogical fitness.
