$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testDist = Join-Path $repoRoot '.test-dist'

function Remove-TestDist {
  $rootPath = [System.IO.Path]::GetFullPath($repoRoot)
  $targetPath = [System.IO.Path]::GetFullPath($testDist)

  if (-not $targetPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside repository: $targetPath"
  }

  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }
}

Push-Location $repoRoot
try {
  Remove-TestDist
  npx tsc -p tsconfig.test.json
  $testFiles = Get-ChildItem -Path (Join-Path $testDist 'tests') -Filter '*.test.js' |
    Sort-Object FullName |
    ForEach-Object { $_.FullName }
  node --test @testFiles
} finally {
  Remove-TestDist
  Pop-Location
}
