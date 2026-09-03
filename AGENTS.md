# AGENTS.md

## Operating environment

Codex runs on Windows for this repository. Use PowerShell syntax for shell
commands.

Prefer Windows PowerShell for repository scripts:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <script.ps1>
```

PowerShell 7 is also acceptable when `pwsh` is available:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File <script.ps1>
```

Do not use Bash syntax unless the user explicitly asks for Bash.

## Project scope discipline

- Keep implementation within the current Subchapter's requested product and
  workflow scope.
- Do not expand backend or frontend scope without an explicit requirement or
  evidence that the requested behavior requires it.
- Do not mix product feature changes and workflow-maintenance changes in the
  same commit.
- During workflow maintenance, do not modify product code unless the user
  explicitly changes the scope.
- For normal application work, ignore `.agents/skills/` unless harness work is
  explicitly in scope. For harness maintenance, `.agents/skills/` is in scope.

## Subchapter workflow

Follow the Global AGENTS Major Chapter session lifecycle without duplicating it
here. Each Subchapter uses this repository sequence:

```text
implementation
-> feedback/fix
-> QA
-> $codex-harness
-> READY_TO_COMMIT
-> user commit
-> clean working tree
```

Run the final `$codex-harness` only after implementation, user feedback fixes,
and QA are complete. Severity, review-scope, environment-blocker, and gate
rules are defined by `$codex-harness`.

With the persistent workflow contracts loaded, a normal final review prompt
should ideally be only:

```text
$codex-harness
Subchapter 6-A final gate.
```

The user owns staging and committing. A Subchapter is not complete until the
user commits and confirms a clean working tree. If another Subchapter remains,
continue it in the same Major Chapter session.

## Validation policy

During development, run targeted validation for the changed area first. Do not
repeat the full regression suite after every edit.

The final harness baseline is:

```powershell
npm test
npx tsc --noEmit
backend\.venv\Scripts\python.exe -m pytest backend
git diff --check
git status --short
```

Add Subchapter-specific validation when the Subchapter contract requires it. If
a required validation cannot run, apply the `$codex-harness`
Environment/Tooling Blocker contract.

