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
  node --test .test-dist/tests/nutrition.test.js .test-dist/tests/meals.test.js .test-dist/tests/mealEvaluation.test.js
} finally {
  Remove-TestDist
  Pop-Location
}
