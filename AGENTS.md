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
- Treat the root Expo application (`App.tsx`, `index.ts`, `src/`, and `assets/`)
  and the `backend/` service as separate project boundaries. Modify both only
  when the requested integration requires it.
- Do not mix product feature changes and workflow-maintenance changes in the
  same commit.
- During workflow maintenance, do not modify product code unless the user
  explicitly changes the scope.

## Project review and validation

Use the user-global `$codex-harness` for the final review and gate. This
repository defines only the project-specific scope and validation contract.

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

Add Subchapter-specific validation when the Subchapter contract requires it.

