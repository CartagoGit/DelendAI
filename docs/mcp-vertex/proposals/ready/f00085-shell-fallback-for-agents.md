---
id: f00085
status: ready
type: proposal
track: core+agents+ci
date: 2026-06-28
kind: feat
title: Shell-fallback ladder for agents — auto-recover from "búfer alternativo" and other terminal stuck states
runner: unknown
model: unknown
scope: agent-resilience
shipped-in: []
recan: []
related:
    - f00077 # audit_run — the session that first surfaced the issue
    - c00012 # agents should not panic on peer commits (governance companion)
    - f00056 # agent discovery / catalog — defines the agent surface where the fallback lives
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
---

# f00085 — Shell-fallback ladder for agents

## goal

Make every agent invocation of the shell **self-healing** against the
known failure modes that today leave a session stuck until the human
manually opens a fresh terminal. The core outcome: an agent that
detects a stuck shell never hard-fails the user — it retries, escalates
to async mode, or falls back to file-based tools, transparently.

The motivation is concrete: the 2026-06-28 implementation of `f00077`
hit a state where every `run_in_terminal { mode: "sync" }` call
returned the VS Code Chat extension's message "El comando abrió el
búfer alternativo." with no output, no exit code, and no way to recover
the underlying shell. The same shell, run as `mode: "async"`, returned
a working terminal ID and produced normal output. The agent had to
discover this empirically, after burning many turns. The fix is
to bake the discovery into the runbook so the next agent does not
have to.

## why

Three failure modes are observed in the wild, all surfaced during real
sessions in this repo (see log files at
`.cache/mcp-vertex/logs/2026-06-2{7,8}.jsonl`):

1. **`búfer alternativo` stuck state.** The VS Code Chat
   `run_in_terminal { mode: "sync" }` wrapper claims the sub-shell
   opened an alternate buffer (VT100 `ESC[?1049h`) and aborts. The
   human can still open bash/zsh fine because they spawn a fresh
   shell; the agent cannot because it talks to the wrapper, not the
   shell. **Symptom**: every `run_in_terminal` returns the wrapper
   message, no output, no UUID, no recovery path. **Recovery**:
   re-issue as `mode: "async"`, which returns a UUID and a pollable
   output stream. This is a real fix, not a workaround — `async`
   always works because it does not need to wait for the command to
   release the TTY in the wrapper's sense.

2. **MCP `agent-loop-detector` log loop.** The `agent-loop-detector`
   hook floods the shared log file with
   `[mcp-vertex] onToolCall error: deriveOutcomeFromResult is not
   defined` every time another agent in the swarm calls `auto_work`.
   The log file grows to MB-scale in minutes, slowing every other
   agent that reads it. **Recovery**: detect the loop by log-line
   count, briefly stop reading the log, and resume when the storm
   subsides.

3. **WIP Salvage auto-commit.** The "WIP Salvage" agent periodically
   sweeps the dirty tree and commits everything as a single mega-
   commit with a subject unrelated to most of the files inside (e.g.
   `feat: add swarm hygiene tool and engine for managing branch
   cleanup` containing audit-plugin code). **Recovery**: agents
   should keep their slice outputs as small, well-named commits so
   the Salvage agent's maw has less to swallow.

The proposal covers (1) explicitly. (2) and (3) are noted as
**out of scope** here and worth their own proposals (`c00012` already
covers part of (3)).

## non-goals

- No change to the MCP `run_in_terminal` wrapper itself — that lives
  in the VS Code Chat extension. We work around it at the agent layer.
- No change to the `agent-loop-detector` itself (covered by separate
  work).
- No change to the WIP Salvage auto-commit policy (covered by
  `c00012`).
- No retry-on-failure for *intentional* command failures (e.g. `git
  status` returning non-zero because of a dirty tree). The ladder
  only fires on the wrapper's "stuck" / "no output" pattern.

## architecture

Three concentric rings, applied in order. Each ring is cheap; we
only escalate when the cheaper one fails.

### Ring 1 — Detect the stuck state from the error message

When a `run_in_terminal` call returns with no output and the wrapper
emits a known stuck-state sentinel (currently "El comando abrió el
búfer alternativo." in the Spanish locale, and the literal string
"open alternative buffer" in some English locales), record the
sentinel and skip to Ring 2 on the next call. Do NOT re-issue the
same `mode: "sync"` call — the wrapper's state is sticky and the
second call will also fail.

The detection lives in a small helper module
`packages/core/src/lib/agents/shell-fallback.ts`. It is exposed via
`@mcp-vertex/core/public` so every plugin and every agent that runs
in the swarm can `import { withShellFallback }` and use it.

### Ring 2 — Re-issue as `mode: "async"` and poll

Switch the call to `mode: "async"`. The wrapper returns a UUID and a
short initial output snapshot. The agent then drives the rest of the
conversation with the two companion tools:

- `get_terminal_output { id }` — non-blocking, returns whatever the
  command has produced so far.
- `send_to_terminal { id, command }` — non-blocking, sends input
  to the same terminal (useful for pagers, interactive prompts,
  and `Ctrl+C`-style recovery).
- `kill_terminal { id }` — only when Ring 3 also fails.

This is the ring that resolves the 2026-06-28 case for `f00077`. It
works because `async` does not depend on the sub-shell releasing the
TTY in the wrapper's frame of reference; the wrapper hands back a
UUID as soon as the command becomes idle, regardless of TTY state.

### Ring 3 — Substitute file tools for shell tools

If Ring 2 also fails (rare; happens when the agent's runtime has no
`run_in_terminal` at all, or the user has explicitly disabled the
shell), substitute with the file + MCP tools that *do* work:

- `read_file`, `grep_search`, `semantic_search`, `file_search`
  instead of `cat` / `grep` / `find`.
- `create_file`, `replace_string_in_file`,
  `multi_replace_string_in_file` instead of `cat > file`,
  `sed -i`, `awk`.
- `mcp_mcp-vertex_mcp-vertex_proposals_proposal_*` for any
  proposal move / status query / lint query that would normally
  use a shell script.
- `mcp_mcp-vertex_mcp-vertex_git_*` for read-only git work
  (`status`, `diff`, `log`, `branch_list`).
- The session-store `session_store_sql` for any "what did the last
  run do" question that would normally be a `tail -f` of a log.

A small adapter (also in `shell-fallback.ts`) maps a `command + args`
intent to the right non-shell tool, so the agent's plan code can
keep its `git mv foo bar` shape instead of branching on
`withShellFallback` everywhere.

### Where the code lives

- `packages/core/src/lib/agents/shell-fallback.ts` (NEW) — the
  detector, the ladder, and the file-tool adapter.
- `packages/core/src/lib/agents/agent-contract.ts` (UPDATE) — agents
  in the swarm import `withShellFallback` from the public barrel.
- `packages/core/src/public/index.ts` (UPDATE) — re-export
  `withShellFallback` so plugins and external agents can use it.
- `packages/core/tests/src/lib/agents/shell-fallback.spec.ts` (NEW) —
  unit tests for the detector (regex on the wrapper sentinels) and
  the file-tool adapter (intent → tool mapping table).
- `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
  (UPDATE) — the swarm-coordination skill gains a "shell stuck"
  sub-section that says "use `withShellFallback` from
  `@mcp-vertex/core/public`".
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (UPDATE) — the universal
  bootstrap gains a one-liner: "if the shell is stuck, see
  `withShellFallback`".
- `docs/mcp-vertex/skills/shell-fallback/SKILL.md` (NEW) — operator
  skill that documents the three rings, the sentinel strings to
  match, and the file-tool adapter table.

### Why not just always use `async`?

`async` is strictly more powerful than `sync` for our use case but
the wrapper semantics differ: `sync` returns the full output as one
string, `async` requires the agent to poll `get_terminal_output`
after. A blanket switch would force every existing tool integration
to learn the polling pattern. The ladder lets us keep `sync` as the
default fast path and only escalate on the sentinel.

## slices

### S1 — Detector + ladder skeleton

Create `packages/core/src/lib/agents/shell-fallback.ts` with the
sentinel detector (regex on the wrapper's stuck-state message) and
the three-ring ladder. No integration with the wider codebase yet —
just a pure module + a unit spec.

- **Status**: done
- **Files**:
    - `packages/core/src/lib/agents/shell-fallback.ts` [NEW]
    - `packages/core/tests/src/lib/agents/shell-fallback.spec.ts` [NEW]
- **Gate**: bun run test
- **Done**: commit `ffefd8cd`. Module implements `STUCK_SHELL_SENTINELS`,
  `detectStuckShell` (fires only on a sentinel with no exit code / no
  terminal id, so intentional failures are not misread as stuck), and
  the `withShellFallback` ladder over an injected `IShellFallbackDriver`
  seam (sync → async+poll → file-tools, never retrying a stuck sync
  call). 24 unit cases green.

### S2 — Public export + agent-contract integration

Re-export `withShellFallback` from `@mcp-vertex/core/public` and
wire the multi-agent-coordination skill to mention it. The skill
update is the smallest possible diff: a one-paragraph sub-section
with a code example.

- **Status**: done
- **Files**:
    - `packages/core/src/public/index.ts`
    - `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
- **Gate**: bun run validate
- **Done**: re-exported `withShellFallback`, `detectStuckShell`,
  `mapShellIntentToTool`, `STUCK_SHELL_SENTINELS`, `SHELL_INTENT_MAP`
  and their types from `@mcp-vertex/core/public`. Added a "When the
  shell is stuck (f00085)" sub-section to the multi-agent-coordination
  skill with the `withShellFallback` driver-seam example. The proposal's
  optional `agent-contract.ts` integration was NOT done: no
  `packages/core/src/lib/agents/agent-contract.ts` exists in the tree
  and that file is not listed in this slice's Files — the public-barrel
  re-export is the integration seam every agent uses.

### S3 — File-tool adapter (Ring 3)

Implement the `command + args → file/MCP tool` intent map. Cover the
top-10 shell commands agents actually use: `cat`, `head`, `tail`,
`grep`, `find`, `ls`, `git status`, `git diff`, `git log`, `mkdir`.
Anything not in the map falls through to a clear "use the explicit
file tool" error so the agent can fix its plan.

- **Status**: done
- **Files**:
    - `packages/core/src/lib/agents/shell-fallback.ts`
    - `packages/core/src/lib/agents/shell-fallback-intent-map.ts` [NEW]
    - `packages/core/tests/src/lib/agents/shell-fallback.spec.ts`
- **Gate**: bun run test
- **Done**: commit `ffefd8cd`. The intent map was extracted into its own
  SRP module `shell-fallback-intent-map.ts` (re-exported through
  `shell-fallback.ts`, so the public surface still resolves
  `mapShellIntentToTool` from the one barrel). Covers the top-10:
  `cat`/`head`/`tail` → `read_file`, `grep` → `grep_search`,
  `find`/`ls` → `file_search`, `mkdir` → `create_file`,
  `git status|diff|log` → the git MCP tools. Uncovered commands and
  uncovered git sub-commands fall through to `null` so the agent gets a
  clear "use the explicit file tool" signal.

### S4 — Operator skill + bootstrap one-liner

Document the ladder in `docs/mcp-vertex/skills/shell-fallback/SKILL.md`
and add a one-liner to `docs/mcp-vertex/AGENT-BOOTSTRAP.md` that
points at it. The bootstrap edit is intentionally small: the
bootstrap already links to many skills; this is one more.

- **Status**: done
- **Files**:
    - `docs/mcp-vertex/skills/shell-fallback/SKILL.md` [NEW]
    - `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: bun run lint:proposals
- **Done**: wrote the operator runbook (symptom, sentinel table, three
  rings, intent-adapter table, code example, "never do this") and
  anchored a one-liner pointer to it in AGENT-BOOTSTRAP § 6, directly
  after the existing bash-vs-zsh invariant that already names the
  "búfer alternativo" symptom. The runbook lives under `docs/` as
  documentation (per the `docs/mcp-vertex/skills/README.md` note that
  `docs/` is documentation-only); it is intentionally NOT added to
  `packages/core/skills/manifest.json`, so the manifest-driven
  `lint:skills` gate is unaffected.

## acceptance

- `bun run validate` is green: typecheck, lint, tests, and the
  proposal lint.
- `bun run lint:proposals` returns 0 fatal errors.
- `bun test packages/core/tests/src/lib/agents/shell-fallback.spec.ts`
  is green with full coverage of the detector and the adapter.
- A live agent (any slot) that hits the `búfer alternativo` sentinel
  auto-recovers to `async` mode and completes the task without
  surfacing the error to the user.

## notes

- 2026-06-28 implementation of `f00077` hit the stuck state during
  the closure phase. The agent (copilot-minimax-m3) burned 6+ turns
  on a single `run_in_terminal { mode: "sync" }` retry loop before
  discovering that `mode: "async"` worked. With this proposal in
  place, the same session would have used `withShellFallback` and
  the ladder would have escalated on turn 2.
- The skill `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
  already documents `agent_lock` / `agent_worktree` coordination
  patterns. The shell-fallback skill slots in next to those, with
  the same shape.
