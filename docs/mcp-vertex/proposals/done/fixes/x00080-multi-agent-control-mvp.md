---
id: x00080
status: done
type: proposal
track: core+agents+governance+plugins/proposals
date: 2026-06-28
kind: fix
title: Multi-agent control MVP — claim-or-no-touch guardrail so parallel agents stop trampling each other
runner: unknown
model: unknown
scope: agent-coordination
shipped-in: []
recan: []
related:
    - f00085 # shell-fallback for agents — companion fix
    - x00079 # cross-plugin fixes from 2026-06-28 audit — overlap with S1/S2/S3
    - c00012 # agents should not panic on peer commits — governance companion
    - f00056 # agent discovery / catalog — defines the agent surface
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
---

# x00080 — Multi-agent control MVP

## goal

Make parallel agent work on this repo **deterministic** instead of chaotic. Today, an external agent (the "WIP Salvage" auto-commit) and any internal agent can touch any file at any time without claiming it first; the result is commits that revert other agents' work, files that appear and disappear, and pushes that get rejected for non-fast-forward. The fix is a **claim-or-no-touch** guardrail that:

1. Forces every agent to call `proposals_agent_lock { action: "claim" }` before editing a file.
2. Rejects any commit whose author did not hold the lock for every file it touches.
3. Surfaces the protocol in `AGENTS.md` / `docs/mcp-vertex/AGENT-BOOTSTRAP.md` so every host picks it up.

This is a **fix**, not a feature: the system already documents `agent_lock` in `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, but enforcement is opt-in. The MVP makes it the default for every commit on every branch.

## why

Three failure modes are observed in the 2026-06-28 session, all caused by the same root issue (lack of claim enforcement):

1. **WIP Salvage auto-commit.** The author `WIP Salvage <wip@local>` makes recurring `update by push` commits on `origin/develop` (verified in `.git/logs/refs/remotes/origin/develop`). The agent is unidentified in the codebase (zero matches for the literal string in any `.ts` / `.json` / `.yml` / `.md` file) and runs from outside the repo. Despite that, it touches arbitrary files and lands commits that revert other agents' work mid-flight. The repo has no defence.

2. **Working-tree revert mid-flight.** An agent (copilot-minimax-m3) commits changes to `plugins/issues/src/index.ts`, `plugins/memory/src/index.ts`, `plugins/quality/src/lib/services/run-all.ts`, and `plugins/proposals/src/lib/agents/delivery-verifier.ts`. Between the agent's `replace_string_in_file` and its `git commit`, the WIP Salvage agent pushes a commit that reverts the same files back to the original state. The agent then has to re-apply the edits and commit again. This pattern wasted 4+ tool calls per slice during the `x00079` session.

3. **Non-fast-forward push loop.** Because external agents push in parallel, every push from a local agent has a non-trivial probability of being rejected with `non-fast-forward`. The local agent then has to `git fetch + git rebase origin/develop + git push`, which is a 3-step dance that breaks the "one logical commit per slice" flow.

The root cause is the same in all three: **no claim enforcement**. The repo has the right primitives (`agent_lock`, `agent_worktree`, the `multi-agent-coordination` skill) but does not enforce their use at commit time.

## non-goals

- No change to the `agent_lock` / `agent_worktree` MCP tools themselves (those are already implemented).
- No change to the host-side settings (`.vscode/settings.json` keeps `chat.tools.autoApprove: true`; the user wants friction-free auto-approval in their sandbox).
- No removal of the WIP Salvage agent — we cannot remove an external process, but we can make it harmless by rejecting its commits.
- No change to the multi-agent-coordination skill content (it is already correct; it just is not enforced).

## architecture

Three concentric rings, applied at git commit time. Each ring is cheap; we only escalate when the cheaper one fails.

### Ring 1 — `claim-or-no-touch` pre-commit hook (git-side)

Add a new git hook at `.git/hooks/pre-commit` (alongside the existing lefthook install) that reads `.cache/mcp-vertex/agents.lock.json` and **rejects** the commit if any of the staged files is held by a different agent than the committer. The committer is identified by the `GIT_AUTHOR_EMAIL` env var. The hook is bypassable via `--no-verify` (left as an escape hatch) but the lint:agents step in `bun run validate` makes bypassing it a hard failure.

Hook logic (pseudocode):

```sh
LOCK_FILE=.cache/mcp-vertex/agents.lock.json
[ -f "$LOCK_FILE" ] || exit 0  # no registry yet — let the commit through
for staged in $(git diff --cached --name-only); do
  holder=$(jq -r --arg f "$staged" '.in_flight[] | select(.files[] == $f) | .agent' "$LOCK_FILE")
  if [ -n "$holder" ] && [ "$holder" != "$GIT_AUTHOR_EMAIL" ]; then
    echo "pre-commit: blocked — $staged is held by $holder, not $GIT_AUTHOR_EMAIL"
    echo "  release it with: bun agent_lock release --file $staged"
    exit 1
  fi
done
```

The hook installs itself on `bun install` (via the existing `prepare` script + a new `tools/scripts/install-claim-hooks.script.ts`) so a fresh clone is protected out of the box.

### Ring 2 — `lint:agents` step in `bun run validate`

A new lint script `tools/scripts/lint/agent-claims.script.ts` that runs as part of `bun run validate`. It walks every git-tracked file, queries `proposals_agent_lock` for the current holders, and **fails the validate gate** when a tracked file has been modified but no lock claim is active for it. This catches the WIP Salvage case: the Salvage agent writes files without claiming them, and the next `bun run validate` run fails until someone (the Salvage agent or a human) either claims the file or reverts the change.

The script's exit codes:
- `0` — every tracked modified file is held by an active claim
- `2` — one or more tracked files are modified without a claim (validate fails)

### Ring 3 — `proposals_force_transition` documentation refresh

The `proposals_force_transition` MCP tool already exists and lets any agent move a proposal between folders (`ready/` → `done/`, etc.) with a reason. The skill `multi-agent-coordination/SKILL.md` does not mention it. This proposal updates the skill to say: **after landing a slice, call `proposals_force_transition` with `to: "done"` and the same commit SHA** so the registry reflects the new state without waiting for the next sync cycle. Today this is manual and many slices get stuck in `ready/` after their code has shipped.

### Where the code lives

- `tools/scripts/install-claim-hooks.script.ts` [NEW] — installs `.git/hooks/pre-commit` and `.git/hooks/pre-push` from a template at `tools/scripts/hooks/`. Wired to run from the `prepare` script in `package.json`.
- `tools/scripts/hooks/pre-commit.sh` [NEW] — the claim-check shell hook described in Ring 1. Bash, not TypeScript, because git hooks need to be POSIX shell.
- `tools/scripts/hooks/pre-push.sh` [NEW] — same check, applied at push time. Catches the case where someone bypassed `--no-verify` on the commit but the push is still in the validate gate.
- `tools/scripts/lint/agent-claims.script.ts` [NEW] — the `lint:agents` step.
- `tools/scripts/lint/agent-claims.spec.ts` [NEW] — unit tests for the script (claim state parsing, file-overlap detection, exit codes).
- `package.json` [MODIFY] — add `prepare` step that calls `install-claim-hooks.script.ts`. Add `lint:agents` script entry. Wire `lint:agents` into the `validate` script.
- `plugins/proposals/skills/multi-agent-coordination/SKILL.md` [MODIFY] — add a "Closing a slice" sub-section that names `proposals_force_transition` and the commit SHA as the standard close path.
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` [MODIFY] — add a one-liner: "every agent MUST hold an `agent_lock` claim for the files it edits; the gate is `lint:agents`".

### Why git hooks (and not the MCP server only)

MCP server enforcement only catches agents that go through the MCP server. The WIP Salvage agent appears to run outside that path (it has a `wip@local` author email and zero matches in any source file). A git hook catches **every** commit, regardless of which agent or process produced it, because every commit has to traverse `.git/hooks/pre-commit`. The hook is bypassable via `--no-verify`, but bypassing it surfaces in `lint:agents` as a tracked-but-unclaimed file change, which fails `bun run validate`.

### Why not just delete the WIP Salvage agent

We cannot — it is an external process. The next best thing is to make its commits harmless: when the hook rejects, the WIP Salvage commit fails to land and the Salvage agent's upstream code path surfaces an error. The Salvage agent will then either fix itself (acquire a claim) or back off (stop pushing dirty trees). Either outcome is acceptable.

## slices

### S1 — claim-or-no-touch pre-commit hook + install script

Create `tools/scripts/install-claim-hooks.script.ts` and the two hook templates. Wire the installer into `bun install` via the `prepare` script. Verify by editing a file outside an active claim and confirming `git commit` blocks.

- **Status**: pending
- **Files**:
    - `tools/scripts/install-claim-hooks.script.ts` [NEW]
    - `tools/scripts/hooks/pre-commit.sh` [NEW]
    - `tools/scripts/hooks/pre-push.sh` [NEW]
    - `package.json` [MODIFY — add `prepare` step]
- **Gate**: bun run test

### S2 — `lint:agents` step in `bun run validate`

Create the lint script and its spec. Wire into `validate` so any tracked file modified without a claim makes the gate fail. Add `lint:agents` to `package.json` scripts and to the `validate` chain.

- **Status**: pending
- **Files**:
    - `tools/scripts/lint/agent-claims.script.ts` [NEW]
    - `tools/scripts/lint/agent-claims.spec.ts` [NEW]
    - `package.json` [MODIFY — add `lint:agents`, wire into `validate`]
- **Gate**: bun run validate

### S3 — Skill + bootstrap documentation refresh

Add the "Closing a slice" sub-section to `multi-agent-coordination/SKILL.md` and the one-liner to `docs/mcp-vertex/AGENT-BOOTSTRAP.md`. The documentation changes are minimal: 2 paragraphs + 1 sentence.

- **Status**: pending
- **Files**:
    - `plugins/proposals/skills/multi-agent-coordination/SKILL.md` [MODIFY]
    - `docs/mcp-vertex/AGENT-BOOTSTRAP.md` [MODIFY]
- **Gate**: bun run lint:proposals

## acceptance

- `bun run validate` is green: typecheck, lint, tests, proposal lint, AND `lint:agents` (new).
- `bun run lint:proposals` returns 0 fatal errors.
- Editing a tracked file without an active `agent_lock` claim, then committing, blocks the commit with a clear error message naming the file and the holder.
- `proposals_agent_lock { action: "claim" }` followed by a commit on the same files lands cleanly.
- The WIP Salvage agent's next commit attempt, if it bypasses the hook with `--no-verify`, fails `bun run validate` and surfaces in the next agent's session as a tracked-but-unclaimed file.

## notes

- The 2026-06-28 implementation of `x00079` (S6, S7, S8) hit this exact pattern: edits applied, reverted by an external commit, re-applied, and committed in 3 cycles. With Ring 1 in place, the first cycle's `git commit` would have been rejected and the agent would have known to claim first.
- The choice to enforce via git hooks AND `lint:agents` (two layers) is intentional: the hook catches the commit at submission time, the lint catches it at validate time. Either layer can be bypassed; both together cover the realistic failure modes.
- The proposal does **not** call out the WIP Salvage author by name in any source file. The hook logic is author-agnostic; it works against any committer, including the WIP Salvage author, a typo'd email, or a future agent we do not yet know about.
- The companion proposal `f00085` (shell-fallback for agents) covers the "stuck shell" failure mode. Together, x00080 + f00085 close the two largest sources of agent downtime observed in this repo's 2026-06-28 sessions.