# MTCExtractFeatures LBDM functions

Copyright (c) 2019 Peter van Kranenburg. MIT license; see LICENSE.

Repository: https://github.com/pvankranenburg/MTCExtractFeatures
Commit: faf310528ee27cfc1f60aaacb10c9545eaa0b301
Source: src/mtc_to_seqs.py

Nine complete function bodies are copied verbatim. Only their required
`from fractions import Fraction` import is retained. UPSTREAM.json records
source/function hashes and line numbers. The original command-line script and
its unrelated corpus, pandas and Humdrum dependencies are not imported.

This implementation produces boundary strengths AFTER notes. These are model
estimates on monophonic material, not annotated or certified phrase endings.
The application adapts its exact note/tie timeline and records peak selection
as a separate product policy; it does not modify the LBDM formula or weights.
