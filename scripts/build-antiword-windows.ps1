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
$targetExe = Join-Path $targetBinDir "antiword.exe"

if (-not (Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir | Out-Null
}
if (-not (Test-Path $targetBinDir)) {
  New-Item -ItemType Directory -Path $targetBinDir -Force | Out-Null
}
if (-not (Test-Path $targetResDir)) {
  New-Item -ItemType Directory -Path $targetResDir -Force | Out-Null
}

if (-not (Test-Path $sourceDir)) {
  git clone $RepoUrl $sourceDir
} else {
  git -C $sourceDir fetch --all --tags --prune
  git -C $sourceDir pull --ff-only
}

$attemptErrors = @()
$built = $false

function Get-ZigExePath {
  param(
    [string]$toolsPath
  )

  $zigCommand = Get-Command zig -ErrorAction SilentlyContinue
  if ($zigCommand) {
    return $zigCommand.Source
  }

  $zigVersion = "0.13.0"
  $zipName = "zig-windows-x86_64-$zigVersion.zip"
  $zigFolderName = "zig-windows-x86_64-$zigVersion"
  $zipPath = Join-Path $toolsPath $zipName
  $extractPath = Join-Path $toolsPath $zigFolderName
  $zigExePath = Join-Path $extractPath "zig.exe"

  if (-not (Test-Path $zigExePath)) {
    if (-not (Test-Path $zipPath)) {
      $downloadUrl = "https://ziglang.org/download/$zigVersion/$zipName"
      Write-Host "Downloading Zig from $downloadUrl"
      Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
    }

    if (-not (Test-Path $extractPath)) {
      Expand-Archive -Path $zipPath -DestinationPath $toolsPath -Force
    }
  }

  if (-not (Test-Path $zigExePath)) {
    throw "zig.exe not found after extraction: $zigExePath"
  }

  return $zigExePath
}

if ((Get-Command cl -ErrorAction SilentlyContinue) -and (Get-Command nmake -ErrorAction SilentlyContinue)) {
  $pushed = $false
  try {
    Push-Location $sourceDir
    $pushed = $true
    nmake /f Makefile.vc60 clean | Out-Null
    nmake /f Makefile.vc60 | Out-Null
    Pop-Location
    $pushed = $false
    if (Test-Path (Join-Path $sourceDir "antiword.exe")) {
      $built = $true
    }
  } catch {
    $attemptErrors += "Visual C++ build failed: $($_.Exception.Message)"
    if ($pushed) { Pop-Location | Out-Null }
  }
}

if (-not $built) {
  $msysBash = "C:\msys64\usr\bin\bash.exe"
  if (Test-Path $msysBash) {
    try {
      $msysSource = $sourceDir -replace '\\', '/'
      & $msysBash -lc "set -e; cd '$msysSource'; make -f Makefile.cygwin clean || true; make -f Makefile.cygwin -j2"
      if (Test-Path (Join-Path $sourceDir "antiword.exe")) {
        $built = $true
      }
    } catch {
      $attemptErrors += "MSYS2 build failed: $($_.Exception.Message)"
    }
  }
}

if (-not $built) {
  try {
    $zigExe = Get-ZigExePath -toolsPath $toolsDir
    $compileSources = @(
      "main_u.c", "asc85enc.c", "blocklist.c", "chartrans.c", "datalist.c",
      "depot.c", "dib2eps.c", "doclist.c", "fail.c", "finddata.c",
      "findtext.c", "fmt_text.c", "fontlist.c", "fonts.c", "fonts_u.c",
      "hdrftrlist.c", "imgexam.c", "imgtrans.c", "jpeg2eps.c", "listlist.c",
      "misc.c", "notes.c", "options.c", "out2window.c", "output.c", "pdf.c",
      "pictlist.c", "png2eps.c", "postscript.c", "prop0.c", "prop2.c",
      "prop6.c", "prop8.c", "properties.c", "propmod.c", "rowlist.c",
      "sectlist.c", "stylelist.c", "stylesheet.c", "summary.c", "tabstop.c",
      "text.c", "unix.c", "utf8.c", "word2text.c", "worddos.c", "wordlib.c",
      "wordmac.c", "wordole.c", "wordwin.c", "xmalloc.c", "xml.c"
    )

    $pushed = $false
    Push-Location $sourceDir
    $pushed = $true
    if (Test-Path "antiword.exe") {
      Remove-Item "antiword.exe" -Force
    }

    & $zigExe cc `
      -target x86_64-windows-gnu `
      -O2 `
      -Wall `
      -Wno-unused-but-set-variable `
      -Wno-parentheses `
      -D__CYGMING__ `
      -DNDEBUG `
      -I. `
      @compileSources `
      -o antiword.exe

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "antiword.exe")) {
      throw "Zig build command failed to produce antiword.exe"
    }

    $built = $true
    Pop-Location
    $pushed = $false
  } catch {
    $attemptErrors += "Zig build failed: $($_.Exception.Message)"
    if ($pushed) { Pop-Location | Out-Null }
  }
}

if (-not $built -and -not (Test-Path $targetExe)) {
  $details = if ($attemptErrors.Count -gt 0) { $attemptErrors -join "`n  - " } else { "No compatible Windows toolchain detected." }
  throw "Failed to build antiword.exe from source.`n  - $details"
}

if (Test-Path (Join-Path $sourceDir "antiword.exe")) {
  Copy-Item (Join-Path $sourceDir "antiword.exe") $targetExe -Force
}

Copy-Item (Join-Path $sourceDir "Resources\*") $targetResDir -Force

Write-Host "Antiword Windows build/setup completed."
Write-Host "Binary: $targetExe"
Write-Host "Resources: $targetResDir"
