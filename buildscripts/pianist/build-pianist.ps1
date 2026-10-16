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
node src/web/appjs/install.js build.artifacts
if ($LASTEXITCODE -ne 0) { throw 'Web resource installation failed' }
python buildscripts/pianist/package-web.py
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed' }
Write-Output 'Pianist ready. Run python buildscripts/pianist/serve-web.py and open its Local URL.'
