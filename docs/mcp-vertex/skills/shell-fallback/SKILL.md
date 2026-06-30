---
name: mcp-vertex-shell-fallback
appliesTo: ['@mcp-vertex/core']
description: Operator runbook for the agent shell-fallback ladder (f00085). What the run_in_terminal "búfer alternativo" stuck state looks like, the sentinel strings that detect it, and the three-ring recovery (sync -> async+poll -> file tools) via withShellFallback from @mcp-vertex/core/public.
---

# mcp-vertex shell-fallback ladder

Operator runbook for the self-healing recovery introduced in `f00085`.
Read this the moment a `run_in_terminal` call returns no output, no exit
code, and a "buffer" message. This is a known, recoverable state — do
not burn turns retrying.

> This is a documentation runbook. The executable contract lives in
> `packages/core/src/lib/agents/shell-fallback.ts` and is re-exported
> from `@mcp-vertex/core/public`. The manifest-registered swarm skill
> (`plugins/proposals/skills/multi-agent-coordination/SKILL.md`)
> restates the one-liner for swarm context.

## The symptom

The VS Code Chat `run_in_terminal { mode: "sync" }` wrapper claims the
sub-shell opened an alternate buffer (VT100 `ESC[?1049h`, typically from
a zsh Powerlevel10k instant prompt) and aborts. You get the wrapper
message, no stdout, no exit code, no terminal UUID, and no recovery
path. The human can still open a fresh shell — they spawn a new one; you
cannot, because you talk to the wrapper, not the shell.

The same shell run as `mode: "async"` returns a UUID and a pollable
output stream. `async` always works here because it does not wait for
the command to release the TTY in the wrapper's frame of reference.

## Sentinel strings (Ring 1 detection)

`detectStuckShell(result)` fires when the output contains one of these
(case-insensitive substring) AND there is no exit code and no terminal
id. A non-zero exit with real output is an *intentional* failure, not a
stuck shell, and the ladder must not fire on it.

| Locale                | Sentinel substring                       |
| --------------------- | ---------------------------------------- |
| Spanish               | `el comando abrió el búfer alternativo`  |
| Spanish (no accent)   | `el comando abrio el bufer alternativo`  |
| English               | `opened the alternate buffer`            |
| English               | `open alternative buffer`                |
| English               | `opened an alternate screen buffer`      |

A new locale variant is one more entry in `STUCK_SHELL_SENTINELS`.

## The three rings

Applied in order, cheapest first. Escalate only when the cheaper ring
fails.

### Ring 1 — detect, do not retry

When the sentinel fires, record it and **do not re-issue the same
`mode: "sync"` call**. The wrapper state is sticky; the second call also
fails. Skip straight to Ring 2.

### Ring 2 — re-issue as `async` and poll

Re-run the command with `mode: "async"`. The wrapper returns a UUID and
a short initial snapshot. Drive the rest with the companion tools:

- `get_terminal_output { id }` — non-blocking, returns output so far.
- `send_to_terminal { id, command }` — non-blocking input (pagers,
  prompts, `Ctrl+C`-style recovery).
- `kill_terminal { id }` — only when Ring 3 also fails.

This ring resolves the case. It is the recommended fix, not a hack.

### Ring 3 — substitute file/MCP tools for shell tools

Only when no terminal exists at all (the runtime has no
`run_in_terminal`, or the user disabled the shell). Map the shell intent
to its non-shell tool with `mapShellIntentToTool({ command, args })`:

| Shell                | Non-shell tool                          |
| -------------------- | --------------------------------------- |
| `cat <file>`         | `read_file { path }`                    |
| `head` / `tail`      | `read_file` with a line range / offset  |
| `grep <pat>`         | `grep_search { query }` (or `semantic_search`) |
| `find` / `ls`        | `file_search { query }`                 |
| `mkdir`              | implicit via `create_file`              |
| `git status`         | `mcp-vertex_git_status`                 |
| `git diff`           | `mcp-vertex_git_diff`                   |
| `git log`            | `mcp-vertex_git_log`                    |

For "what did the last run do?" use `session_store_sql` instead of
`tail -f` on a log. For proposal moves/status use the
`proposals_proposal_*` tools instead of a shell script.

Anything not in the table returns `null` from `mapShellIntentToTool` —
that is your signal to call the explicit file/MCP tool directly rather
than shelling out.

## Code

```ts
import { withShellFallback } from '@mcp-vertex/core/public';

const outcome = await withShellFallback('bun run validate', {
  runSync: (cmd) => runInTerminal(cmd, { mode: 'sync' }),
  runAsync: (cmd) => runInTerminal(cmd, { mode: 'async' }),
  pollAsync: (id) => getTerminalOutput(id),
});

if (outcome.ring === 'file-tools') {
  // No terminal available — translate the intent.
  const plan = mapShellIntentToTool({ command: 'git', args: ['status'] });
  // plan.tool === 'mcp-vertex_git_status'
}
```

`outcome.trail` is a compact, human-readable record of what the ladder
tried. Surface "auto-recovered via async" from it rather than dumping
the raw wrapper error on the user.

## Never do this

1. Do not retry a stuck `mode: "sync"` call. The state is sticky.
2. Do not surface the raw "búfer alternativo" wrapper error to the user
   as a failure — the ladder recovers it transparently.
3. Do not fire the ladder on an *intentional* non-zero exit (e.g. `git
   status` exiting non-zero on a dirty tree). That is real output, not a
   stuck shell.
