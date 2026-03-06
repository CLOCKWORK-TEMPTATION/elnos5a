param(
  [string]$RepoUrl = "https://github.com/grobian/antiword.git"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolsDir = Join-Path $projectRoot ".tools"
$sourceDir = Join-Path $toolsDir "antiword-src"
$targetBinDir = Join-Path $toolsDir "antiword-app\bin"
$targetResDir = Join-Path $toolsDir "antiword-app\Resources"

if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  throw "WSL is required to build antiword Linux binary (gcc + make)."
}

if (-not (Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

if (-not (Test-Path $sourceDir)) {
  git clone $RepoUrl $sourceDir
} else {
  git -C $sourceDir fetch --all --tags --prune
  git -C $sourceDir pull --ff-only
}

$wslProjectRoot = (wsl wslpath -a $projectRoot).Trim()
$wslSourceDir = "$wslProjectRoot/.tools/antiword-src"
$wslTargetBinDir = "$wslProjectRoot/.tools/antiword-app/bin"
$wslTargetResDir = "$wslProjectRoot/.tools/antiword-app/Resources"

wsl bash -lc "set -e; command -v gcc >/dev/null; command -v make >/dev/null"
wsl bash -lc "set -e; cd '$wslSourceDir'; make -f Makefile.Linux clean; make -f Makefile.Linux -j2"
wsl bash -lc "set -e; mkdir -p '$wslTargetBinDir' '$wslTargetResDir'; cp -f '$wslSourceDir/antiword' '$wslTargetBinDir/antiword'; cp -f '$wslSourceDir/Resources/'* '$wslTargetResDir/'"

Write-Host "Antiword Linux build completed."
Write-Host "Binary: $targetBinDir\antiword"
Write-Host "Resources: $targetResDir"
