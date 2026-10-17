param(
    [ValidateSet('app', 'audio')][string]$Target = 'app',
    [int]$Jobs = 12,
    [switch]$FastLink,
    [switch]$ConfigureOnly,
    [switch]$SkipConfigure
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$env:TEMP = Join-Path $root '.tools/tmp'
$env:TMP = $env:TEMP
$env:EMSDK_QUIET = '1'
New-Item -ItemType Directory -Force $env:TEMP, (Join-Path $root 'artifacts/m0') | Out-Null
$localTools = Join-Path $root '.tools/python/Scripts'
if (Test-Path $localTools) { $env:PATH = "$localTools;$env:PATH" }
$cmakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
if ($cmakeCommand) { $cmakeExe = $cmakeCommand.Source }
else {
    $cmakeBin = & python -c 'import cmake; print(cmake.CMAKE_BIN_DIR)'
    if ($LASTEXITCODE -ne 0) { throw 'Install CMake >= 3.22 before building.' }
    $cmakeExe = Join-Path $cmakeBin 'cmake.exe'
}
# Avoid emsdk_env.ps1's shared temporary script when app/audio build concurrently.
$env:EMSDK = Join-Path $root '.tools/emsdk'
$env:EM_CONFIG = Join-Path $env:EMSDK '.emscripten'
$env:EMSDK_PYTHON = (Get-Command python).Source
$env:PATH = "$env:EMSDK;$env:EMSDK/upstream/emscripten;$env:PATH"
$qtRoot = (Join-Path $root '.tools/Qt/6.10.2').Replace('\', '/')
$buildDir = if ($Target -eq 'app') { 'build.m0' } else { 'build.audio.m0' }
$sourceDir = if ($Target -eq 'app') { '.' } else { 'src/web/audioengine' }
$arguments = @('-S', $sourceDir, '-B', $buildDir, '-G', 'Ninja',
    '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
    '-DQT_QML_IMPORT_SCANNER_EXTRA_ARGS=-exclude;.tools;-exclude;.git',
    "-DCMAKE_TOOLCHAIN_FILE=$qtRoot/wasm_singlethread/lib/cmake/Qt6/qt.toolchain.cmake",
    "-DQT_HOST_PATH=$qtRoot/mingw_64")
if ($Target -eq 'app') {
    # Link outside the live preview directory. Publish only completed binaries.
    $stage = Join-Path $root '.tools/web-stage-app'
    $arguments += "-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=$($stage.Replace('\', '/'))"
    $arguments += @('-DMUSESCORE_BUILD_CONFIGURATION=app-web', '-DMUSE_APP_BUILD_MODE=dev',
        '-DMUSE_COMPILE_USE_COMPILER_CACHE=OFF', '-DMUE_DOWNLOAD_SOUNDFONT=OFF',
        '-DMUSE_COMPILE_USE_UNITY=ON', '-DMUSESCORE_REVISION=3654226c2e-pianist')
    if ($FastLink) { $arguments += '-DPIANIST_WASM_FAST_LINK=ON' }
    else { $arguments += '-DPIANIST_WASM_FAST_LINK=OFF' }
}
$configLog = Join-Path $root "artifacts/m0/configure-$Target.log"
if ($SkipConfigure -and $Target -eq 'app') {
    $cachedMode = Select-String -LiteralPath "$buildDir/CMakeCache.txt" -Pattern '^PIANIST_WASM_FAST_LINK:[^=]+='
    $cachedFast = $cachedMode -and $cachedMode.Line.EndsWith('=ON')
    if ([bool]$FastLink -ne [bool]$cachedFast) { throw 'Requested link mode differs from the CMake cache. Run without -SkipConfigure to apply the requested mode.' }
}
if (!$SkipConfigure) {
    Write-Output "Configuring $Target. Log: $configLog"
    & $cmakeExe @arguments *> $configLog
    if ($LASTEXITCODE -ne 0) { Get-Content $configLog -Tail 90; throw "Configure failed: $Target" }
}
if ($ConfigureOnly) { Write-Output 'Configuration succeeded.'; exit 0 }
$buildLog = Join-Path $root "artifacts/m0/build-$Target.log"
Write-Output "Building $Target with $Jobs jobs. Log: $buildLog"
& $cmakeExe --build $buildDir --parallel $Jobs *> $buildLog
if ($LASTEXITCODE -ne 0) { Get-Content $buildLog -Tail 90; throw "Build failed: $Target" }
Get-Content $buildLog -Tail 8
Write-Output "Build succeeded: $Target"
$runtimeSetting = Select-String -LiteralPath "$buildDir/CMakeCache.txt" -Pattern '^CMAKE_RUNTIME_OUTPUT_DIRECTORY:[^=]+='
if ($Target -eq 'app' -and $runtimeSetting -and ($runtimeSetting.Line.Split('=', 2)[1] -eq $stage.Replace('\', '/'))) {
    foreach ($name in @('MuseScoreStudio.wasm', 'MuseScoreStudio.js')) {
        Copy-Item -LiteralPath (Join-Path $stage $name) -Destination (Join-Path $root "build.artifacts/$name") -Force
    }
}
