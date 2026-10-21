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

PianoPlayer's effort score is a model output, not a piano-learning grade or a
validated speed limit. Its onset-based cost is not evidence that a held finger
has been released. K3 keeps source integrity/held-note checks and does not use
this model to approve shifts, leaps, complex fingering or pedagogical fitness.
