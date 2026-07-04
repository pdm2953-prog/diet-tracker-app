\# AGENTS.md



\## Operating environment



You are Codex running on Windows.



Use PowerShell syntax for shell commands.



Prefer:



\~\~\~powershell

powershell.exe -NoProfile -ExecutionPolicy Bypass -File <script.ps1>

\~\~\~



If `pwsh` is available, PowerShell 7 is also acceptable:



\~\~\~powershell

pwsh -NoProfile -ExecutionPolicy Bypass -File <script.ps1>

\~\~\~



Do not use Bash syntax unless the user explicitly asks for Bash.



\## Non-recursion rule



Do not call:



\- `codex`

\- `codex exec`

\- `codex review`



from inside this repository workflow unless the user explicitly asks to test Codex itself.



You are already Codex.



Helper scripts may collect context, run deterministic commands, and write files.

Helper scripts must not spawn another model session.



\## Repository workflow



When reviewing code:



1\. Inspect `git status`.

2\. Determine the base branch.

3\. Inspect the diff against base.

4\. Include staged, unstaged, and untracked changes when relevant.

5\. Look for real bugs, security issues, data-loss risks, Windows path issues, PowerShell quoting issues, encoding problems, and missing tests.

6\. Report findings in Korean.

7\. Use severity markers:

&#x20;  - `\[P1]` critical blocker

&#x20;  - `\[P2]` advisory or non-blocking concern

8\. End with one of:

&#x20;  - `GATE: PASS`

&#x20;  - `GATE: PASS\_WITH\_NOTES`

&#x20;  - `GATE: FAIL`



\## Scope boundary



When reviewing normal application code, ignore `.agents/skills/` unless the user is explicitly working on Codex harness skills.



When the user is working on this harness, `.agents/skills/` is in scope.

