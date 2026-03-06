param(
  [string]$RepoUrl = "https://github.com/grobian/antiword.git"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$windowsScript = Join-Path $PSScriptRoot "build-antiword-windows.ps1"
$linuxScript = Join-Path $PSScriptRoot "build-antiword-linux.ps1"

$warnings = @()

try {
  & powershell -ExecutionPolicy Bypass -File $windowsScript -RepoUrl $RepoUrl
} catch {
  $warnings += "Windows antiword build step failed: $($_.Exception.Message)"
}

try {
  & powershell -ExecutionPolicy Bypass -File $linuxScript -RepoUrl $RepoUrl
} catch {
  $warnings += "Linux antiword build step failed: $($_.Exception.Message)"
}

if ($warnings.Count -gt 0) {
  Write-Warning ("Antiword hybrid build completed with warnings:`n- " + ($warnings -join "`n- "))
} else {
  Write-Host "Antiword hybrid build completed successfully."
}
