param(
  [string]$BaseUrl = "http://127.0.0.1:8787",
  [string]$EndpointPath = "/api/file-extract",
  [switch]$RequirePdfOcr
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extractUrl = ($BaseUrl.TrimEnd("/") + $EndpointPath)
$healthUrl = ($BaseUrl.TrimEnd("/") + "/health")

$fixtureSpecs = @(
  @{
    RelativePath = "tests/fixtures/regression/12.doc"
    Extension = "doc"
    Requires = "antiword"
    ExpectedMethod = "doc-converter-flow"
  },
  @{
    RelativePath = "tests/fixtures/regression/12.pdf"
    Extension = "pdf"
    Requires = "ocr"
    ExpectedMethod = "ocr-mistral"
  }
)

Write-Host "Running JSON extract smoke against: $extractUrl"
Write-Host "Backend health endpoint: $healthUrl"

function Get-BackendHealth {
  param([string]$url)

  try {
    return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
  } catch {
    Write-Warning "Could not read backend health endpoint: $($_.Exception.Message)"
    return $null
  }
}

function Test-IsLegacyWordDoc {
  param([byte[]]$Bytes)

  if (-not $Bytes -or $Bytes.Length -lt 8) {
    return $false
  }

  $oleSignature = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
  for ($index = 0; $index -lt $oleSignature.Length; $index++) {
    if ([int]$Bytes[$index] -ne $oleSignature[$index]) {
      return $false
    }
  }

  return $true
}

$health = Get-BackendHealth -url $healthUrl
$ocrConfigured = $false
$antiwordReady = $false

if ($health) {
  $ocrConfigured = [bool]$health.ocrConfigured
  $antiwordReady = [bool]$health.antiwordBinaryAvailable -and [bool]$health.antiwordHomeExists
  Write-Host ("Health: ocrConfigured={0}, antiwordReady={1}" -f $ocrConfigured, $antiwordReady)
} else {
  Write-Warning "Proceeding without capability hints because health is unavailable."
}

$passed = 0
$failed = 0
$skipped = 0
$executed = 0

foreach ($spec in $fixtureSpecs) {
  $fixturePath = Join-Path $projectRoot $spec.RelativePath
  $name = Split-Path -Leaf $fixturePath
  $extension = $spec.Extension

  if (-not (Test-Path $fixturePath)) {
    Write-Warning "Fixture not found and will be skipped: $fixturePath"
    $skipped++
    continue
  }

  if ($spec.Requires -eq "antiword" -and $health -and -not $antiwordReady) {
    Write-Host ("[FAIL] {0} -> antiword is not ready (check /health)." -f $name)
    $failed++
    continue
  }

  if ($spec.Requires -eq "ocr" -and $health -and -not $ocrConfigured) {
    if ($RequirePdfOcr) {
      Write-Host ("[FAIL] {0} -> OCR not configured but -RequirePdfOcr is set." -f $name)
      $failed++
    } else {
      Write-Warning ("[SKIP] {0} -> OCR not configured, skipping PDF smoke." -f $name)
      $skipped++
    }
    continue
  }

  $bytes = [System.IO.File]::ReadAllBytes($fixturePath)

  if ($extension -eq "doc" -and -not (Test-IsLegacyWordDoc -Bytes $bytes)) {
    Write-Warning ("[SKIP] {0} -> fixture is not a binary .doc file." -f $name)
    $skipped++
    continue
  }

  $base64 = [System.Convert]::ToBase64String($bytes)

  $payload = @{
    filename = $name
    extension = $extension
    fileBase64 = $base64
  } | ConvertTo-Json -Depth 5

  $executed++

  try {
    $response = Invoke-RestMethod -Uri $extractUrl -Method Post -ContentType "application/json; charset=utf-8" -Body $payload -TimeoutSec 180

    if ($response.success -and $response.data -and [string]::IsNullOrWhiteSpace([string]$response.data.text) -eq $false) {
      $method = $response.data.method
      if ($spec.ExpectedMethod -and $method -ne $spec.ExpectedMethod) {
        Write-Host ("[FAIL] {0} -> unexpected method. expected={1}, actual={2}" -f $name, $spec.ExpectedMethod, $method)
        $failed++
      } else {
        Write-Host ("[PASS] {0} -> method={1}" -f $name, $method)
        $passed++
      }
    } else {
      $errorMessage = if ($response.error) { $response.error } else { "Unknown error" }
      Write-Host ("[FAIL] {0} -> {1}" -f $name, $errorMessage)
      $failed++
    }
  } catch {
    Write-Host ("[FAIL] {0} -> request failed: {1}" -f $name, $_.Exception.Message)
    $failed++
  }
}

Write-Host ("Summary: pass={0}, fail={1}, skip={2}, executed={3}" -f $passed, $failed, $skipped, $executed)

if ($executed -eq 0) {
  throw "Smoke extract did not execute any fixture."
}

if ($failed -gt 0) {
  throw ("Smoke extract failed with {0} failing case(s)." -f $failed)
}

Write-Host "Smoke extract completed successfully."
