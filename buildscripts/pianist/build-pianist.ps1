param([switch]$SkipEngine, [switch]$FastLink, [switch]$SkipInstall, [int]$Jobs = 10)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$env:TEMP = Join-Path $root '.tools/tmp'
$env:TMP = $env:TEMP
if (!$SkipEngine) {
    & "$PSScriptRoot/build-web.ps1" -Target audio -Jobs $Jobs
    if ($LASTEXITCODE -ne 0) { throw 'Audio engine build failed' }
    & "$PSScriptRoot/build-web.ps1" -FastLink:$FastLink -Jobs $Jobs
    if ($LASTEXITCODE -ne 0) { throw 'Notation engine build failed' }
    & "$PSScriptRoot/build-renderer.ps1" -FastLink:$FastLink -Jobs $Jobs -Publish
    if ($LASTEXITCODE -ne 0) { throw 'Exercise renderer build failed' }
}
Push-Location (Join-Path $root 'apps/pianist-web')
try {
    if (!$SkipInstall) { npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Domain/platform tests failed' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web shell build failed' }
} finally { Pop-Location }
python buildscripts/pianist/prepare-fixtures.py
if ($LASTEXITCODE -ne 0) { throw 'Fixture preparation failed' }
python buildscripts/pianist/prepare-score-format-sources.py
if ($LASTEXITCODE -ne 0) { throw 'ABC runtime preparation failed' }
node src/web/appjs/install.js build.artifacts
if ($LASTEXITCODE -ne 0) { throw 'Web resource installation failed' }
python buildscripts/pianist/prepare-notices.py
if ($LASTEXITCODE -ne 0) { throw 'Runtime notice collection failed' }
python buildscripts/pianist/install-piano-samples.py
if ($LASTEXITCODE -ne 0) { throw 'Light piano samples failed' }
python buildscripts/pianist/composed-reading-bank.py
if ($LASTEXITCODE -ne 0) { throw 'Composed grade bank packaging failed' }
python buildscripts/pianist/package-web.py
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed' }
Write-Output 'Pianist ready. Run python buildscripts/pianist/serve-web.py and open its Local URL.'
