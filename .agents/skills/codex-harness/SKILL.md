---
name: codex-harness
description: Windows PowerShell Codex-native harness for structured code review, diff review, P1/P2 gate, Korean merge readiness report, and harness engineering.
---

# Codex Harness

## Purpose

Run a structured review workflow inside Codex.

This skill is Codex-native.

Do not call:

- `codex`
- `codex exec`
- `codex review`

You are already Codex.

## Supported modes

MVP supports:

```text
review
Future modes:

challenge
verify
consult
Review mode workflow

When the user invokes this skill for review:

Confirm you are in a git repository.
Run the helper script:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\skills\codex-harness\scripts\Collect-ReviewContext.ps1
Read the generated file:
.codex-harness/review-context.md
Analyze the collected context directly.
Do not modify project files during review mode.
Produce a Korean report.
Non-recursion rule

Never spawn another Codex process from this skill.

PowerShell scripts are deterministic helpers only.
They collect context.
They do not call another model.

Severity policy

Use:

[P1]: merge blocker. Real bug, security issue, data-loss risk, broken build, or severe regression.
[P2]: non-blocking but actionable concern.
No marker: observation only.
Gate rule
If any [P1] finding exists: GATE: FAIL
If no [P1] but at least one [P2]: GATE: PASS_WITH_NOTES
If no actionable findings: GATE: PASS
Output format

Always answer in Korean.

Use this exact structure:

# Codex Harness Review

## 결론

GATE: PASS | PASS_WITH_NOTES | FAIL

## 핵심 판정

- P1: <number>
- P2: <number>
- Base branch: <branch>
- Reviewed scope: <summary>

## Findings

### [P1] <title>

- 위치:
- 문제:
- 재현/실패 조건:
- 영향:
- 최소 수정:

### [P2] <title>

- 위치:
- 문제:
- 영향:
- 권장 조치:

## 테스트/검증 제안

- <commands or checks>

## Recommendation

<one concrete next action>
Windows-specific review checklist

Check for:

PowerShell quoting mistakes
pwsh vs powershell.exe assumptions
CRLF/LF problems
path separator bugs
case-insensitive filesystem assumptions
commands that work only on Linux/macOS
Korean text encoding issues
scripts that fail under ExecutionPolicy
unsafe recursive calls to Codex