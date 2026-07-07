param(
  [int]$Port = $(if ($env:RCT_METRO_PORT) { [int]$env:RCT_METRO_PORT } else { 8081 })
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$expo = Join-Path $projectRoot 'node_modules\.bin\expo.cmd'

if (-not (Test-Path -LiteralPath $expo)) {
  throw "Expo CLI was not found at $expo. Run npm install first."
}

# Expo SDK 57's Metro web fallback serves the app HTML from /index.
# The root path is still reserved for the native manifest used by Expo Go.
$webUrl = "http://localhost:$Port/index"
$browserJob = $null

if ($env:EXPO_WEB_OPEN -ne '0') {
  $browserJob = Start-Job -ScriptBlock {
    param([int]$Port, [string]$WebUrl)

    $deadline = (Get-Date).AddSeconds(90)

    while ((Get-Date) -lt $deadline) {
      try {
        $response = Invoke-WebRequest `
          -UseBasicParsing `
          -Uri $WebUrl `
          -Headers @{ Accept = 'text/html' } `
          -TimeoutSec 2
        $contentType = [string]$response.Headers['Content-Type']

        if ($response.StatusCode -eq 200 -and $contentType.StartsWith('text/html')) {
          Start-Process $WebUrl
          return
        }
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }

    Write-Warning "Expo web page did not become ready at $WebUrl within 90 seconds."
  } -ArgumentList $Port, $webUrl
}

try {
  $env:BROWSER = 'none'
  & $expo start --web --port $Port
  exit $LASTEXITCODE
} finally {
  if ($null -ne $browserJob) {
    if ($browserJob.State -eq 'Running') {
      Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
    }

    Receive-Job -Job $browserJob -ErrorAction SilentlyContinue |
      ForEach-Object { Write-Host $_ }
    Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
  }
}
