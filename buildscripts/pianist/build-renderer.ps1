param([int]$Jobs = 10, [switch]$FastLink, [switch]$Publish, [switch]$SkipConfigure)
$ErrorActionPreference = 'Stop'
$rendererRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $rendererRoot
$env:TEMP = Join-Path $rendererRoot '.tools/tmp'
$env:TMP = $env:TEMP
$env:EMSDK = Join-Path $rendererRoot '.tools/emsdk'
$env:EM_CONFIG = Join-Path $env:EMSDK '.emscripten'
$env:EMSDK_PYTHON = (Get-Command python).Source
$env:PATH = "$rendererRoot/.tools/python/Scripts;$env:EMSDK;$env:EMSDK/upstream/emscripten;$env:PATH"
New-Item -ItemType Directory -Force artifacts/q0/renderer | Out-Null
$cmakeExe = (Get-Command cmake -ErrorAction SilentlyContinue).Source
if (!$cmakeExe) { $cmakeExe = Join-Path (& python -c 'import cmake; print(cmake.CMAKE_BIN_DIR)') 'cmake.exe' }
$mode = if ($FastLink) { 'ON' } else { 'OFF' }
if ($SkipConfigure) {
    $cachedMode = Select-String -LiteralPath 'build.m0/CMakeCache.txt' -Pattern '^PIANIST_RENDERER_FAST_LINK:[^=]+='
    if (!$cachedMode -or $cachedMode.Line.Split('=', 2)[1] -ne $mode) { throw 'Renderer link mode differs from the CMake cache. Run without -SkipConfigure.' }
} else {
    # Windows PowerShell 5 treats redirected native stderr as error records.
    # A CMake warning is not a failed configure; use its process exit code.
    $savedErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $cmakeExe -S . -B build.m0 "-DPIANIST_RENDERER_FAST_LINK=$mode" *> artifacts/q0/renderer/configure.log
        $configureExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedErrorPreference }
    if ($configureExitCode -ne 0) { Get-Content artifacts/q0/renderer/configure.log -Tail 70; throw 'Renderer configuration failed' }
}
& $cmakeExe --build build.m0 --target PianistRenderer --parallel $Jobs *> artifacts/q0/renderer/build.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/q0/renderer/build.log -Tail 70; throw 'Renderer build failed' }
Get-Content artifacts/q0/renderer/build.log -Tail 8
$rendererStage = Join-Path $rendererRoot '.tools/web-stage-renderer'
$rendererFiles = foreach ($name in @('PianistRenderer.mjs', 'PianistRenderer.wasm')) {
    $file = Get-Item -LiteralPath (Join-Path $rendererStage $name)
    @{ path = $name; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower() }
}
$rendererBuild = @{
    schemaVersion = 1; optimizedLink = !$FastLink; qt = '6.10.2'
    files = @($rendererFiles)
}
$rendererBuild | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $rendererStage 'build.json') -Encoding utf8
if ($Publish) {
    $destination = Join-Path $rendererRoot 'build.artifacts/renderer'
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    foreach ($name in @('PianistRenderer.mjs', 'PianistRenderer.wasm', 'build.json')) {
        Copy-Item -LiteralPath (Join-Path $rendererStage $name) -Destination (Join-Path $destination $name) -Force
    }
    Write-Output 'Renderer installed. Run package-web.py after building the web shell.'
} else {
    Write-Output 'Renderer build complete in .tools/web-stage-renderer (not published).'
}
