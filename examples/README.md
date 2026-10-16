# Local example scores

The user's Phố Xa piano example was copied locally from the file referenced by
Musix's `artifacts/gate-9-viewport-final/demo-mxl-metadata.json`.

- Local copy: `examples/local/pho-xa.mxl` (25,903 bytes).
- SHA-256: `319dee74d098e16af5ffafeae76e4fc6821397f8e18363cf16282157d4734a97`.
- `install.js` stages it as the primary example with the title **Phố Xa**.

User-provided music lives in ignored `local/`; the public source repository does
not redistribute this arrangement. Without the local file, installation selects
the project's original CC0 piano fixture automatically.

To add your own local copy, place it at `examples/local/pho-xa.mxl` and run
`node src/web/appjs/install.js build.artifacts` followed by the web packaging step.
