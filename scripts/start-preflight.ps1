$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[start:preflight] $Message"
}

function Write-WarnStep {
  param([string]$Message)
  Write-Warning "[start:preflight] $Message"
}

function Get-FileImportPortFromEnvFile {
  param([string]$EnvFilePath)

  if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    return $null
  }

  $lines = Get-Content -LiteralPath $EnvFilePath -ErrorAction SilentlyContinue
  foreach ($rawLine in $lines) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    if ($line -match '^\s*FILE_IMPORT_PORT\s*=\s*(.+?)\s*$') {
      $candidate = $Matches[1].Trim().Trim('"').Trim("'")
      if ($candidate -match '^\d+$') {
        return [int]$candidate
      }
    }
  }

  return $null
}

function Resolve-BackendPort {
  param([string]$EnvFilePath)

  if ($env:FILE_IMPORT_PORT -and $env:FILE_IMPORT_PORT.Trim() -match '^\d+$') {
    return [int]$env:FILE_IMPORT_PORT.Trim()
  }

  $fromEnvFile = Get-FileImportPortFromEnvFile -EnvFilePath $EnvFilePath
  if ($fromEnvFile) {
    return [int]$fromEnvFile
  }

  return 8787
}

function Stop-NodeProcessesByScript {
  param([string]$ScriptPattern)

  $killedAny = $false
  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $ScriptPattern }

  foreach ($process in $nodeProcesses) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-Step "kill-by-script pid=$($process.ProcessId)"
      $killedAny = $true
    }
    catch {
      Write-WarnStep "kill-by-script failed pid=$($process.ProcessId): $($_.Exception.Message)"
    }
  }

  if (-not $killedAny) {
    Write-Step "kill-by-script none"
  }
}

function Stop-ProcessesListeningOnPort {
  param([int]$Port, [string]$StageLabel = "kill-by-port")

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  $killedAny = $false
  foreach ($procId in $listeners) {
    if (-not $procId -or $procId -eq 0) {
      continue
    }

    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Step "$StageLabel pid=$procId port=$Port"
      $killedAny = $true
    }
    catch {
      Write-WarnStep ("$StageLabel failed pid={0}: {1}" -f $procId, $_.Exception.Message)
    }
  }

  if (-not $killedAny) {
    Write-Step "$StageLabel none"
  }
}

function Assert-PortFreed {
  param([int]$Port)

  for ($attempt = 1; $attempt -le 3; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    $stillListening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $stillListening) {
      Write-Step "port-check ok port=$Port"
      return
    }

    Write-Step "port-check retry=$attempt port=$Port still-listening"
    Stop-ProcessesListeningOnPort -Port $Port -StageLabel "kill-by-port-retry"
  }

  throw "failed to free backend port $Port"
}

function Remove-CachePath {
  param(
    [string]$RepoRoot,
    [string]$RelativePath
  )

  $absolutePath = Join-Path $RepoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $absolutePath)) {
    Write-Step "cache-clean skip path=$RelativePath (not-found)"
    return
  }

  $normalizedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
  $normalizedPath = [System.IO.Path]::GetFullPath($absolutePath)
  if (-not $normalizedPath.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "unsafe cache target resolved outside repo: $RelativePath"
  }

  $removed = $false
  for ($attempt = 1; $attempt -le 2; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $absolutePath -Recurse -Force -ErrorAction Stop
      Write-Step "cache-clean removed path=$RelativePath"
      $removed = $true
      break
    }
    catch {
      Write-WarnStep ("cache-clean locked path={0} attempt={1}: {2}" -f $RelativePath, $attempt, $_.Exception.Message)
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $removed) {
    Write-WarnStep "cache-clean skip path=$RelativePath (still-locked)"
  }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$envFilePath = Join-Path $repoRoot ".env"
$backendPort = Resolve-BackendPort -EnvFilePath $envFilePath

Write-Step "begin"
Write-Step "repo-root=$repoRoot"
Write-Step "backend-port=$backendPort"

Stop-NodeProcessesByScript -ScriptPattern 'file-import-server\.mjs'
Stop-NodeProcessesByScript -ScriptPattern 'next-server'
Stop-ProcessesListeningOnPort -Port 3000 -StageLabel "kill-nextjs-port"
Stop-ProcessesListeningOnPort -Port $backendPort -StageLabel "kill-backend-port"
Assert-PortFreed -Port 3000
Assert-PortFreed -Port $backendPort

$cachePaths = @(
  "node_modules/.vite",
  "tmp",
  "dist",
  "test-results",
  ".next"
)

foreach ($cachePath in $cachePaths) {
  Remove-CachePath -RepoRoot $repoRoot -RelativePath $cachePath
}

Write-Step "done"
