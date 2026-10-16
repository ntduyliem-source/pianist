# Workspace-local toolchain. Requires Python 3.11+ and Git on PATH.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$lock = Get-Content (Join-Path $PSScriptRoot 'toolchain.json') -Raw | ConvertFrom-Json
$tools = Join-Path $root '.tools'
$env:TEMP = Join-Path $tools 'tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $tools,$env:TEMP,(Join-Path $tools 'downloads') | Out-Null
$python = Join-Path $tools 'python/Scripts/python.exe'
if (!(Test-Path $python)) {
    & python -m venv (Join-Path $tools 'python')
    if ($LASTEXITCODE) { throw 'Cannot create Python environment.' }
}
& $python -m pip install --no-cache-dir "aqtinstall==$($lock.aqtinstall)" "cmake==$($lock.cmake)" "ninja==$($lock.ninja)"
if ($LASTEXITCODE) { throw 'Tool installation failed.' }
$emsdk = Join-Path $tools 'emsdk'
if (!(Test-Path (Join-Path $emsdk '.git'))) {
    & git clone https://github.com/emscripten-core/emsdk.git $emsdk
    if ($LASTEXITCODE) { throw 'emsdk clone failed.' }
}
& git -C $emsdk checkout --detach $lock.emsdkCommit
if ($LASTEXITCODE) { throw 'Cannot select pinned emsdk.' }
& $python (Join-Path $emsdk 'emsdk.py') install $lock.emscripten
if ($LASTEXITCODE) { throw 'Emscripten installation failed.' }
& $python (Join-Path $emsdk 'emsdk.py') activate $lock.emscripten
if ($LASTEXITCODE) { throw 'Emscripten activation failed.' }
$qt = Join-Path $tools 'Qt'
$archives = Join-Path $tools 'downloads'
if (!(Test-Path (Join-Path $qt "$($lock.qt)/wasm_singlethread/lib/cmake/Qt6/Qt6Config.cmake"))) {
    & $python -m aqt install-qt all_os wasm $lock.qt $lock.qtTarget -O $qt -m qt5compat qtshadertools --archives qtbase qtdeclarative qtsvg --archive-dest $archives
    if ($LASTEXITCODE) { throw 'Qt WASM installation failed.' }
}
if (!(Test-Path (Join-Path $qt "$($lock.qt)/mingw_64/bin/moc.exe"))) {
    & $python -m aqt install-qt windows desktop $lock.qt $lock.qtHostWindows -O $qt -m qtshadertools --archives qtbase qtdeclarative --archive-dest $archives
    if ($LASTEXITCODE) { throw 'Qt host tools installation failed.' }
}
Write-Output 'Toolchain installed inside .tools. Run buildscripts/pianist/build-web.ps1 next.'
