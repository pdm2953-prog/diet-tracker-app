$ErrorActionPreference = "Stop"

$script:CollectorFailures = @()

function Add-CollectorFailure {
    param(
        [Parameter(Mandatory)]
        [string]$Operation,

        [Parameter(Mandatory)]
        [string]$ExitCode,

        [Parameter(Mandatory)]
        [string]$ErrorSummary
    )

    $script:CollectorFailures += [PSCustomObject]@{
        Operation    = $Operation
        ExitCode     = $ExitCode
        ErrorSummary = $ErrorSummary
    }
}

function Get-ErrorSummary {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return "No stderr or error output was captured."
    }

    $Summary = ($Text -replace "\s+", " ").Trim()

    if ($Summary.Length -gt 500) {
        return $Summary.Substring(0, 500) + "..."
    }

    return $Summary
}

function Invoke-GitText {
    param(
        [Parameter(Mandatory)]
        [string]$Operation,

        [Parameter(Mandatory)]
        [string[]]$GitArgs,

        [switch]$Optional
    )

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ExitCode = -1
    $Text = ""
    $ErrorText = ""
    $StdErrPath = ""

    try {
        $ErrorActionPreference = "Continue"
        $StdErrPath = [System.IO.Path]::GetTempFileName()
        $RawOutput = @(& git @GitArgs 2> $StdErrPath)
        $ExitCode = $LASTEXITCODE
        $Text = ($RawOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

        if (Test-Path -LiteralPath $StdErrPath) {
            $ErrorText = Get-Content -LiteralPath $StdErrPath -Raw -ErrorAction SilentlyContinue
        }
    } catch {
        $ErrorText = $_.Exception.Message
    } finally {
        $ErrorActionPreference = $PreviousErrorActionPreference

        if ($StdErrPath -and (Test-Path -LiteralPath $StdErrPath)) {
            Remove-Item -LiteralPath $StdErrPath -Force -ErrorAction SilentlyContinue
        }
    }

    if ($ExitCode -ne 0) {
        $FailureText = if ([string]::IsNullOrWhiteSpace($ErrorText)) { $Text } else { $ErrorText }
        $Summary = Get-ErrorSummary -Text $FailureText

        if (-not $Optional) {
            Add-CollectorFailure -Operation $Operation -ExitCode ([string]$ExitCode) -ErrorSummary $Summary
        }

        $FailureOutput = if ($Optional) { "" } else { "[COLLECTION FAILED: $Operation]" }

        return [PSCustomObject]@{
            Success      = $false
            ExitCode     = $ExitCode
            Output       = $FailureOutput
            ErrorSummary = $Summary
        }
    }

    return [PSCustomObject]@{
        Success      = $true
        ExitCode     = $ExitCode
        Output       = $Text
        ErrorSummary = ""
    }
}

function Get-SectionText {
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Result
    )

    if ([string]::IsNullOrWhiteSpace($Result.Output)) {
        return "(none)"
    }

    return $Result.Output
}

$OutDir = ".codex-harness"
$OutFile = Join-Path $OutDir "review-context.md"
$Fence = '````'

if (!(Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$InsideGitResult = Invoke-GitText -Operation "confirm Git work tree" -GitArgs @(
    "rev-parse",
    "--is-inside-work-tree"
)
$RepoRootResult = Invoke-GitText -Operation "resolve repository root" -GitArgs @(
    "rev-parse",
    "--show-toplevel"
)
$CurrentBranchResult = Invoke-GitText -Operation "resolve current branch" -GitArgs @(
    "branch",
    "--show-current"
)

$InsideGit = if ($InsideGitResult.Success) {
    $InsideGitResult.Output.Trim()
} else {
    "[COLLECTION FAILED: confirm Git work tree]"
}

$RepoRoot = if ($RepoRootResult.Success -and $RepoRootResult.Output.Trim()) {
    $RepoRootResult.Output.Trim()
} else {
    "[COLLECTION FAILED: resolve repository root]"
}

$CurrentBranch = if (-not $CurrentBranchResult.Success) {
    "[COLLECTION FAILED: resolve current branch]"
} elseif ($CurrentBranchResult.Output.Trim()) {
    $CurrentBranchResult.Output.Trim()
} else {
    "(detached HEAD)"
}

$HeadCheck = Invoke-GitText -Operation "probe HEAD commit" -GitArgs @(
    "rev-parse",
    "--verify",
    "HEAD"
) -Optional
$HasHead = $HeadCheck.Success -and -not [string]::IsNullOrWhiteSpace($HeadCheck.Output)

$BaseBranch = "(unresolved)"
$BaseRef = "(unresolved)"
$BaseRefResolution = "UNRESOLVED"

$OriginHead = Invoke-GitText -Operation "probe origin HEAD" -GitArgs @(
    "symbolic-ref",
    "--quiet",
    "refs/remotes/origin/HEAD"
) -Optional

if ($OriginHead.Success -and $OriginHead.Output.Trim() -match '^refs/remotes/origin/(.+)$') {
    $BaseBranch = $Matches[1]
}

if ($BaseBranch -eq "(unresolved)") {
    $OriginMain = Invoke-GitText -Operation "probe origin/main" -GitArgs @(
        "rev-parse",
        "--verify",
        "origin/main"
    ) -Optional

    if ($OriginMain.Success) {
        $BaseBranch = "main"
    }
}

if ($BaseBranch -eq "(unresolved)") {
    $OriginMaster = Invoke-GitText -Operation "probe origin/master" -GitArgs @(
        "rev-parse",
        "--verify",
        "origin/master"
    ) -Optional

    if ($OriginMaster.Success) {
        $BaseBranch = "master"
    }
}

if ($BaseBranch -eq "(unresolved)") {
    $LocalMain = Invoke-GitText -Operation "probe local main" -GitArgs @(
        "rev-parse",
        "--verify",
        "main"
    ) -Optional

    if ($LocalMain.Success) {
        $BaseBranch = "main"
    }
}

if ($BaseBranch -eq "(unresolved)") {
    $LocalMaster = Invoke-GitText -Operation "probe local master" -GitArgs @(
        "rev-parse",
        "--verify",
        "master"
    ) -Optional

    if ($LocalMaster.Success) {
        $BaseBranch = "master"
    }
}

if (-not $HasHead) {
    $BaseRefResolution = "NOT_APPLICABLE_NO_HEAD"
} elseif ($BaseBranch -ne "(unresolved)") {
    $OriginBaseCheck = Invoke-GitText -Operation "probe origin base ref" -GitArgs @(
        "rev-parse",
        "--verify",
        "origin/$BaseBranch"
    ) -Optional

    if ($OriginBaseCheck.Success) {
        $BaseRef = "origin/$BaseBranch"
        $BaseRefResolution = "RESOLVED"
    } else {
        $LocalBaseCheck = Invoke-GitText -Operation "probe local base ref" -GitArgs @(
            "rev-parse",
            "--verify",
            $BaseBranch
        ) -Optional

        if ($LocalBaseCheck.Success) {
            $BaseRef = $BaseBranch
            $BaseRefResolution = "RESOLVED"
        }
    }
}

if ($HasHead -and $BaseRefResolution -ne "RESOLVED") {
    Add-CollectorFailure `
        -Operation "resolve base ref" `
        -ExitCode "N/A" `
        -ErrorSummary "No usable origin or local main/master base ref was found."
}

$GitStatusResult = Invoke-GitText -Operation "collect git status --short" -GitArgs @(
    "status",
    "--short"
)

if ($HasHead -and $BaseRefResolution -eq "RESOLVED") {
    $BranchDiffStatResult = Invoke-GitText -Operation "collect committed branch diff stat" -GitArgs @(
        "diff",
        "$BaseRef...HEAD",
        "--stat"
    )
    $BranchDiffNameOnlyResult = Invoke-GitText -Operation "collect committed branch changed files" -GitArgs @(
        "diff",
        "$BaseRef...HEAD",
        "--name-only"
    )
    $BranchDiffResult = Invoke-GitText -Operation "collect committed branch diff" -GitArgs @(
        "diff",
        "$BaseRef...HEAD"
    )
} else {
    $BranchContextReason = if (-not $HasHead) {
        "[NOT COLLECTED: repository has no HEAD commit]"
    } else {
        "[COLLECTION FAILED: committed/base context unavailable]"
    }

    $BranchDiffStatResult = [PSCustomObject]@{ Output = $BranchContextReason }
    $BranchDiffNameOnlyResult = [PSCustomObject]@{ Output = $BranchContextReason }
    $BranchDiffResult = [PSCustomObject]@{ Output = $BranchContextReason }
}

$StagedDiffStatResult = Invoke-GitText -Operation "collect staged diff stat" -GitArgs @(
    "diff",
    "--cached",
    "--stat"
)
$StagedDiffNameOnlyResult = Invoke-GitText -Operation "collect staged changed files" -GitArgs @(
    "diff",
    "--cached",
    "--name-only"
)
$StagedDiffResult = Invoke-GitText -Operation "collect staged diff" -GitArgs @(
    "diff",
    "--cached"
)

$UnstagedDiffStatResult = Invoke-GitText -Operation "collect unstaged diff stat" -GitArgs @(
    "diff",
    "--stat"
)
$UnstagedDiffNameOnlyResult = Invoke-GitText -Operation "collect unstaged changed files" -GitArgs @(
    "diff",
    "--name-only"
)
$UnstagedDiffResult = Invoke-GitText -Operation "collect unstaged diff" -GitArgs @(
    "diff"
)

$UntrackedFilesResult = Invoke-GitText -Operation "collect untracked files" -GitArgs @(
    "ls-files",
    "--others",
    "--exclude-standard"
)

$UntrackedPreviewSections = @()
$UntrackedList = @()

if ($UntrackedFilesResult.Success) {
    $UntrackedList = $UntrackedFilesResult.Output -split "`r?`n" | Where-Object {
        $_ -and $_.Trim()
    }
}

foreach ($File in $UntrackedList) {
    $Path = $File.Trim()

    try {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            Add-CollectorFailure `
                -Operation "preview untracked file: $Path" `
                -ExitCode "N/A" `
                -ErrorSummary "The untracked path was not a readable file."
            $UntrackedPreviewSections += "### $Path`r`n`r`n[COLLECTION FAILED: untracked preview unavailable]"
            continue
        }

        $Item = Get-Item -LiteralPath $Path

        if ($Item.Length -gt 200KB) {
            $UntrackedPreviewSections += "### $Path`r`n`r`nFile is larger than 200KB. Preview skipped."
            continue
        }

        $Body = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        $UntrackedPreviewSections += @"
### $Path

${Fence}text
$Body
$Fence
"@
    } catch {
        $Summary = Get-ErrorSummary -Text $_.Exception.Message
        Add-CollectorFailure `
            -Operation "preview untracked file: $Path" `
            -ExitCode "N/A" `
            -ErrorSummary $Summary
        $UntrackedPreviewSections += "### $Path`r`n`r`n[COLLECTION FAILED: untracked preview unavailable]"
    }
}

$CollectorStatus = if ($script:CollectorFailures.Count -eq 0) {
    "OK"
} else {
    "DEGRADED"
}

$FailureText = if ($script:CollectorFailures.Count -eq 0) {
    "- none"
} else {
    ($script:CollectorFailures | ForEach-Object {
        "- $($_.Operation) / exit code: $($_.ExitCode) / $($_.ErrorSummary)"
    }) -join [Environment]::NewLine
}

$UntrackedPreview = if ($UntrackedPreviewSections.Count -eq 0) {
    "(none)"
} else {
    $UntrackedPreviewSections -join ([Environment]::NewLine + [Environment]::NewLine)
}

$GitStatus = Get-SectionText -Result $GitStatusResult
$BranchDiffStat = Get-SectionText -Result $BranchDiffStatResult
$BranchDiffNameOnly = Get-SectionText -Result $BranchDiffNameOnlyResult
$BranchDiff = Get-SectionText -Result $BranchDiffResult
$StagedDiffStat = Get-SectionText -Result $StagedDiffStatResult
$StagedDiffNameOnly = Get-SectionText -Result $StagedDiffNameOnlyResult
$StagedDiff = Get-SectionText -Result $StagedDiffResult
$UnstagedDiffStat = Get-SectionText -Result $UnstagedDiffStatResult
$UnstagedDiffNameOnly = Get-SectionText -Result $UnstagedDiffNameOnlyResult
$UnstagedDiff = Get-SectionText -Result $UnstagedDiffResult
$UntrackedFiles = Get-SectionText -Result $UntrackedFilesResult

$Content = @"
# Codex Harness Review Context

## Collector Diagnostics

Collector Status: $CollectorStatus
Base ref resolution: $BaseRefResolution

Failures:
$FailureText

## Repository

Inside Git work tree: $InsideGit
Repo root: $RepoRoot
Current branch: $CurrentBranch
Base branch: $BaseBranch
Base ref used for committed branch context: $BaseRef
Has HEAD commit: $HasHead

## Git Status

${Fence}text
$GitStatus
$Fence

## Committed Branch Context

This section is supporting base-branch context only.

### Diff stat

${Fence}text
$BranchDiffStat
$Fence

### Changed files

${Fence}text
$BranchDiffNameOnly
$Fence

### Diff

${Fence}diff
$BranchDiff
$Fence

## Staged Changes

### Diff stat

${Fence}text
$StagedDiffStat
$Fence

### Changed files

${Fence}text
$StagedDiffNameOnly
$Fence

### Diff

${Fence}diff
$StagedDiff
$Fence

## Unstaged Changes

### Diff stat

${Fence}text
$UnstagedDiffStat
$Fence

### Changed files

${Fence}text
$UnstagedDiffNameOnly
$Fence

### Diff

${Fence}diff
$UnstagedDiff
$Fence

## Untracked Files

${Fence}text
$UntrackedFiles
$Fence

## Untracked File Previews

$UntrackedPreview
"@

$Content | Set-Content -LiteralPath $OutFile -Encoding UTF8

Write-Host "Review context written to $OutFile"
Write-Host "Collector Status: $CollectorStatus"
Write-Host "Collector failures: $($script:CollectorFailures.Count)"
Write-Host "Base branch: $BaseBranch"
Write-Host "Base ref: $BaseRef"
Write-Host "Base ref resolution: $BaseRefResolution"
Write-Host "Has HEAD commit: $HasHead"
