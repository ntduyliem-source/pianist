param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$venv = Join-Path $repo '.tools/curriculum-python'
$scratch = Join-Path $repo '.tools/tmp'
$cache = Join-Path $repo '.tools/pip-cache'
$savedTemp, $savedTmp, $savedCache = $env:TEMP, $env:TMP, $env:PIP_CACHE_DIR
try {
    New-Item -ItemType Directory -Force -Path $scratch, $cache | Out-Null
    $env:TEMP = $scratch; $env:TMP = $scratch; $env:PIP_CACHE_DIR = $cache
    & $Python -c "import sys,struct; assert sys.version_info[:2]==(3,11) and struct.calcsize('P')==8, 'Q2 lock requires Python 3.11 x64'"
    if ($LASTEXITCODE -ne 0) { throw 'Python version does not match the checked dependency lock.' }
    & $Python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated curriculum environment.' }
    $buildPython = Join-Path $venv 'Scripts/python.exe'
    & $buildPython -m pip install --require-hashes --only-binary=:all: -r (Join-Path $PSScriptRoot 'curriculum-normalize-win-py311.lock')
    if ($LASTEXITCODE -ne 0) { throw 'Pinned dependency installation failed.' }
    & $buildPython -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Curriculum dependency check failed.' }
    & $buildPython -c "import music21; assert music21.__version__=='10.5.0'; print('Q2 music21', music21.__version__)"
    if ($LASTEXITCODE -ne 0) { throw 'Curriculum parser version check failed.' }
} finally {
    $env:TEMP = $savedTemp; $env:TMP = $savedTmp; $env:PIP_CACHE_DIR = $savedCache
}
