$ErrorActionPreference = "Stop"

function Invoke-GitText {
    param(
        [Parameter(Mandatory)]
        [string[]]$GitArgs
    )

    try {
        $Output = & git @GitArgs 2>$null
        if ($LASTEXITCODE -ne 0) {
            return ""
        }

        return ($Output | Out-String)
    } catch {
        return ""
    }
}

$OutDir = ".codex-harness"
$OutFile = Join-Path $OutDir "review-context.md"

if (!(Test-Path $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$InsideGit = Invoke-GitText @("rev-parse", "--is-inside-work-tree")

if ($InsideGit.Trim() -ne "true") {
    throw "Not inside a git repository."
}

$RepoRoot = (Invoke-GitText @("rev-parse", "--show-toplevel")).Trim()
$CurrentBranch = (Invoke-GitText @("branch", "--show-current")).Trim()

if (-not $CurrentBranch) {
    $CurrentBranch = "unknown"
}

$HasHead = $false
$HeadCheck = Invoke-GitText @("rev-parse", "--verify", "HEAD")

if ($HeadCheck.Trim()) {
    $HasHead = $true
}

$BaseBranch = ""

$OriginHead = Invoke-GitText @("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")

if ($OriginHead.Trim()) {
    $BaseBranch = $OriginHead.Trim() -replace "refs/remotes/origin/", ""
}

if (-not $BaseBranch) {
    $OriginMain = Invoke-GitText @("rev-parse", "--verify", "origin/main")
    if ($OriginMain.Trim()) {
        $BaseBranch = "main"
    }
}

if (-not $BaseBranch) {
    $OriginMaster = Invoke-GitText @("rev-parse", "--verify", "origin/master")
    if ($OriginMaster.Trim()) {
        $BaseBranch = "master"
    }
}

if (-not $BaseBranch) {
    $LocalMain = Invoke-GitText @("rev-parse", "--verify", "main")
    if ($LocalMain.Trim()) {
        $BaseBranch = "main"
    }
}

if (-not $BaseBranch) {
    $LocalMaster = Invoke-GitText @("rev-parse", "--verify", "master")
    if ($LocalMaster.Trim()) {
        $BaseBranch = "master"
    }
}

if (-not $BaseBranch) {
    $BaseBranch = "main"
}

$BaseRef = ""

$OriginBaseCheck = Invoke-GitText @("rev-parse", "--verify", "origin/$BaseBranch")

if ($OriginBaseCheck.Trim()) {
    $BaseRef = "origin/$BaseBranch"
} else {
    $LocalBaseCheck = Invoke-GitText @("rev-parse", "--verify", $BaseBranch)

    if ($LocalBaseCheck.Trim()) {
        $BaseRef = $BaseBranch
    }
}

$GitStatus = Invoke-GitText @("status", "--short")

$BranchDiffStat = ""
$BranchDiffNameOnly = ""
$BranchDiff = ""

if ($HasHead -and $BaseRef) {
    $BranchDiffStat = Invoke-GitText @("diff", "$BaseRef...HEAD", "--stat")
    $BranchDiffNameOnly = Invoke-GitText @("diff", "$BaseRef...HEAD", "--name-only")
    $BranchDiff = Invoke-GitText @("diff", "$BaseRef...HEAD")
}

$StagedDiffStat = Invoke-GitText @("diff", "--cached", "--stat")
$StagedDiffNameOnly = Invoke-GitText @("diff", "--cached", "--name-only")
$StagedDiff = Invoke-GitText @("diff", "--cached")

$UnstagedDiffStat = Invoke-GitText @("diff", "--stat")
$UnstagedDiffNameOnly = Invoke-GitText @("diff", "--name-only")
$UnstagedDiff = Invoke-GitText @("diff")

$UntrackedFiles = Invoke-GitText @("ls-files", "--others", "--exclude-standard")

$UntrackedPreview = ""

$UntrackedList = $UntrackedFiles -split "`r?`n" | Where-Object {
    $_ -and $_.Trim()
}

foreach ($File in $UntrackedList) {
    $Path = $File.Trim()

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $Item = Get-Item -LiteralPath $Path

        if ($Item.Length -le 200KB) {
            $Body = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
            $UntrackedPreview += @"

### $Path

````text
$Body
"@
} else {
$UntrackedPreview += @"

$Path

File is larger than 200KB. Preview skipped.

"@
}
}
}

$Content = @"

Codex Harness Review Context
Repository
Repo root: $RepoRoot
Current branch: $CurrentBranch
Base branch: $BaseBranch
Base ref used for committed branch diff: $BaseRef
Has HEAD commit: $HasHead
Git status
$GitStatus
Branch diff stat
$BranchDiffStat
Branch changed files
$BranchDiffNameOnly
Branch diff
$BranchDiff
Staged diff stat
$StagedDiffStat
Staged changed files
$StagedDiffNameOnly
Staged diff
$StagedDiff
Unstaged diff stat
$UnstagedDiffStat
Unstaged changed files
$UnstagedDiffNameOnly
Unstaged diff
$UnstagedDiff
Untracked files
$UntrackedFiles
Untracked file previews

$UntrackedPreview
"@

$Content | Set-Content -Path $OutFile -Encoding UTF8

Write-Host "Review context written to $OutFile"
Write-Host "Base branch: $BaseBranch"
Write-Host "Base ref: $BaseRef"
Write-Host "Has HEAD commit: $HasHead"