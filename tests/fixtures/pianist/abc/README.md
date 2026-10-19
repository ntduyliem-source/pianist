# ABC converter fixtures

These small original fixtures are dedicated to CC0. The pitches and rhythms in
`expected.json` are hand-counted in quarter-note units, independent of either
converter. Python parses MusicXML only to compare the converter output to those
expectations; production notation parsing remains the pinned upstream code.

Piano grand staff uses one named voice (`name="Piano"`) inside the brace. This is
abc2xml's documented source behavior in `mkGrand`: an unnamed brace can remain
two separate parts. Do not silently infer that unrelated parts are one piano.

The tunebook deliberately repeats both X and title; selection must use the
zero-based position, preserving the shared meter/length/tempo preamble.
