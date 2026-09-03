---
name: codex-harness
description: Windows PowerShell Codex-native review gate with P1/P2/P3 findings, remediation, validation, and PASS/BLOCKED reporting.
---

# Codex Harness

## Purpose

Run the current Subchapter's structured review, remediation, validation, and
final gate inside Codex. A Subchapter is the gate/commit work unit; its Major
Chapter is the Codex session boundary. This skill is the source of truth for
review scope, severity, environment blockers, and gate reporting.

The supported mode is:

```text
review
```

Always report the final result in Korean.

## Harness lifecycle

### Phase 1 - Collect

1. Confirm that the current directory is a Git repository.
2. Run the deterministic context collector:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\skills\codex-harness\scripts\Collect-ReviewContext.ps1
   ```

3. Read `.codex-harness/review-context.md`.
4. Inspect `Collector Status` and every collector failure. Treat incomplete
   critical collection as an Environment/Tooling Blocker; do not interpret a
   failed collection as an empty diff.

### Phase 2 - Review

Perform a read-only review and create P1, P2, and P3 findings.

Review all current Subchapter changes relative to `HEAD`, including:

- staged changes
- unstaged changes
- untracked files

Committed branch and base-branch data may be used as supporting context only.
Do not substitute it for the complete `HEAD`-relative Subchapter scope.

### Phase 3 - Remediation

Run this phase only when P1 or P2 findings exist, or when the user explicitly
promotes a P3 finding to a blocker.

In the same Major Chapter session, make the smallest correction that resolves
each blocking finding. Add or strengthen regression tests when needed to prove
the fix. Do not broaden the Subchapter scope.

### Phase 4 - Re-review

After remediation, collect and review the entire updated Subchapter diff again.
Do not review only the latest patch.

Repeat remediation and re-review until no blocking code finding remains or a
real blocker prevents further progress.

### Phase 5 - Validation

Run the repository's final harness baseline from `AGENTS.md` and every
Subchapter-specific required validation. Record each command as PASS, FAIL, or
BLOCKED with a concise result.

### Phase 6 - Gate

Return only one of these gate states:

- `PASS`: no unresolved P1/P2 finding, no user-promoted blocking P3, all
  required validation passed, and no unresolved Environment/Tooling Blocker.
- `BLOCKED`: any blocking finding remains, required validation failed or could
  not run, critical review context is incomplete, or another blocker prevents
  a defensible pass.

`PASS` means `READY_TO_COMMIT` only.

## Severity policy

### P1

A release-blocking correctness or safety issue, including:

- data loss or corruption
- security- or safety-critical behavior
- a crash or unusable core flow
- fundamentally incorrect feature semantics
- another release-blocking correctness issue

### P2

A meaningful violation of required Subchapter behavior, including:

- a meaningful functional regression
- missing or incorrect required behavior
- an important persistence, migration, date, or state error
- a major integration or regression gap
- failure to satisfy the current Subchapter contract

### P3

A non-blocking issue, including:

- quality, style, or maintainability concerns
- cosmetic inconsistency
- minor test or documentation improvements

P1 and P2 findings block the gate. P3 findings do not block by default. A P3
finding blocks only when the user explicitly promotes it to a blocker.

## Environment and tooling blockers

Keep CODE findings separate from Environment/Tooling Blockers. Do not count an
environment or tooling failure as P1, P2, or P3.

If a required validation cannot run, the gate is BLOCKED. Do not repair an
environment problem by making arbitrary product-code changes.

When only an Environment/Tooling Blocker was resolved and the product diff did
not change:

1. Confirm that the complete diff is identical to the previously reviewed
   diff.
2. Reuse the previous code-review result when it remains applicable.
3. Re-run the failed or blocked validation first.

Any actual diff change requires review of the changed full scope.

## Harness boundary

This skill is Codex-native. Never call or spawn:

- `codex`
- `codex exec`
- `codex review`
- another Codex process, session, or thread

PowerShell helpers are deterministic collectors only. They do not call a model,
judge severity, run validation, remediate findings, or decide the gate.

The harness does not start the next Subchapter or Major Chapter and does not
stage or commit files. At `READY_TO_COMMIT`, Codex stops. The user owns staging
and committing. After the user commits and confirms a clean tree, continue any
remaining Subchapter in the same Major Chapter session.

## Final output contract

Use this stable structure:

```text
P1: <count>
P2: <count>
P3: <count>

Findings:
- <finding details, or none>

Validation:
- npm test: <PASS | FAIL | BLOCKED and concise result>
- npx tsc --noEmit: <PASS | FAIL | BLOCKED and concise result>
- backend pytest: <PASS | FAIL | BLOCKED and concise result>
- git diff --check: <PASS | FAIL | BLOCKED and concise result>
- Subchapter-specific: <PASS | FAIL | BLOCKED | none and concise result>

Environment/Tooling Blockers:
- <details, or none>

GATE: PASS | BLOCKED
Subchapter: READY_TO_COMMIT | BLOCKED
```

## Windows review checklist

Check for:

- PowerShell quoting mistakes
- `pwsh` versus `powershell.exe` assumptions
- CRLF/LF problems
- Windows path separator bugs
- case-insensitive filesystem assumptions
- commands that work only on Linux or macOS
- Korean text encoding issues
- scripts that fail under ExecutionPolicy
- unsafe recursive calls to Codex
