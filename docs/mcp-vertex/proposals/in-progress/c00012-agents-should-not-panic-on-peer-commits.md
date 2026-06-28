---
id: c00012
status: in-progress
type: proposal
track: governance
date: 2026-06-28
kind: chore
title: Agents should not panic when other agents (or humans) commit
shipped-in: []
recan: []
related:
  - f00002 # derive site manifests and local aliases (where the rule first appeared)
  - f00057 # skill unification — compacted AGENTS.md / copilot-instructions.md to point at AGENT-BOOTSTRAP.md; this proposal re-anchored the rule there
ownership:
  - { agent: implementation_runner, task: 'S1: surface the five-point rule in AGENTS.md, the multi-agent skill, and copilot-instructions.md (initial landing, commit 6481b0e8)' }
  - { agent: implementation_runner, task: 'S2: post f00057 refactor, move the canonical rule to docs/mcp-vertex/AGENT-BOOTSTRAP.md § 4.b and shrink the SKILL to a pointer + micro-pattern' }
  - { agent: delivery_verifier, task: 'V1: confirm the rule appears in the bootstrap and the SKILL, `bun run validate` is green, and the catalog check is unaffected' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run lint:tools, expect: exit0 }
  - { command: bun run lint:conventions, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# c00012 - Agents should not panic when other agents (or humans) commit

## Goal

Codify, at the repo level, the rule that already exists buried inside
[f00002](../done/feats/f00002-derive-site-manifests-and-local-aliases.md)
("do not panic, do not redo the work, read the commit") so every agent
working in this workspace treats peer commits as **normal background
activity**, not as a failure signal that triggers replanning, re-reading,
or self-doubt.

The workspace is shared. Other agents, CI bots, and humans commit
constantly. An agent that flinches every time `git status` shows a new
entry is an agent that burns tokens, drops slices, and produces nothing.

## Why

Repeated incidents across recent sessions:

- `affairs-copilot-editor-sandbox-a00032-fixes` — a parallel agent
  modified files inside the same detached worktree while the main
  agent was still editing. The main agent had to learn the hard way
  that "trust git diff, not staleness reports".
- `affairs-copilot-editor-sandbox-console-suppression` — a parallel
  agent's reset/clean swept away slice work that was sitting in the
  dirty tree. The lesson there was to commit slice outputs as soon as
  they typecheck.
- f00002 — a slice was reverted within seconds of being written. The
  surviving rule was "do not panic, do not redo the work, read the
  commit".

All three are the same lesson with different costumes. Codify it once
so the third agent does not have to rediscover it.

## why this design

The rule is short and lives in three places so every agent hits it:

1. `AGENTS.md` — under a new short section "Coexistence with parallel
   work" right after the discovery loop section. Single paragraph +
   the five numbered points.
2. `plugins/proposals/skills/multi-agent-coordination/SKILL.md` — as
   a new top-level section "When you see unexpected changes" with the
   rule restated for swarm context, plus the canonical micro-pattern
   "unexpected diff → `git log -1` → keep going".
3. `.github/copilot-instructions.md` — one bullet under the existing
   "Don't loop, don't poll" section so the always-loaded instruction
   file reminds the host chat of the rule.

No new tool, no new engine, no new lock primitive. `git status
--porcelain` and `git log -1` are already in every agent's toolkit.
Behavioural change is achieved by surfacing the rule in the prompt
context of every agent on every turn.

## non-goals

- This proposal does **not** change `auto_work`, `agent_lock`,
  `agent_worktree`, or any engine. It is a pure behaviour spec for
  the agent reading it.
- This proposal does **not** introduce a new tool to detect external
  commits. `git status --porcelain` and `git log -1` are sufficient
  and already in every agent's toolkit.
- This proposal does **not** attempt to police other agents' commits.
  If a peer commit breaks the build, that is `c00002` / a00032
  territory (build hardening), not governance.

## architecture

### The five-point rule

When an agent working on a slice observes that something in the working
tree, the index, or the active branch has changed since the last write
**and the change is not its own**:

1. **Do not panic.** The change is not a bug. It is not an attack.
   It is not necessarily directed at your slice.
2. **Do not redo the work.** If you wrote a file 30 seconds ago and
   it now shows different content, assume the new content is
   intentional. Read what is there *now*, not what you remember
   writing.
3. **Read the commit.** A `git log -1` (or `git diff HEAD~1 -- <path>`)
   explains what happened in one low-token call. If the commit covers
   your intent, **accept it and proceed**. If it conflicts, do a
   surgical follow-up, not a re-plan.
4. **Do not widen scope.** "Making progress" by claiming adjacent
   files because your own slice got disrupted is the same anti-pattern
   as taking a non-disjoint slice while another agent holds the lock.
   Either wait, take a different truly disjoint slice, or close the
   current slice with the honest note "blocked by external change".
5. **Trust `git diff` over memory.** The working tree is the source
   of truth. What you *think* you wrote is, at best, a hypothesis.

This rule applies equally to: another `mcp-vertex` agent committing on
the same branch, CI pushing a `chore(deps):` bump that touches
`bun.lock`, a human pushing a typo fix in an unrelated proposal,
`proposals_sync_proposals` regenerating an index file, the worktree's
own hook (lefthook, biome --write) rewriting a file on commit, and a
stale worktree that shares the same `.git` dir.

### Canonical micro-pattern

```text
git log -1 -- <path>          # what changed?
git diff HEAD~1 -- <path>     # full diff if needed
# accept and proceed, OR surgical follow-up. NEVER re-plan.
```

### Where the rule lives in the prompt

After the f00057 refactor, `AGENTS.md` and `.github/copilot-instructions.md`
collapsed to single pointers to `docs/mcp-vertex/AGENT-BOOTSTRAP.md`.
That file is now the **single source of truth** for repo-wide agent
rules, always loaded by every host.

- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` § 4.b "Coexistence with parallel
  work" — full five-point rule + micro-pattern. Loaded every turn by
  every host. **Single source of truth.**
- `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
  "When you see unexpected changes" — short pointer to the bootstrap
  plus the swarm-specific micro-pattern. Loaded on demand by the
  proposals plugin when an agent enters swarm context.

The previous S1 surfaces (`AGENTS.md` body, `copilot-instructions.md`
bullet) were valid before the f00057 compaction but became dead weight
after it. S2 collapsed them into the bootstrap so the rule survives any
future refactor of `AGENTS.md` / `copilot-instructions.md`.

## slices

### S1 — promote the "don't panic on peer commits" rule to AGENTS.md, the multi-agent skill, and copilot-instructions.md

- **Status**: done
- **Files**: `AGENTS.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `.github/copilot-instructions.md`, `docs/mcp-vertex/proposals/ready/c00012-agents-should-not-panic-on-peer-commits.md`
- **Gate**: `bun run validate` (exit 0). Catalog regeneration is not
  affected because the catalog generator does not read these files.
- **Commit**: `6481b0e8 chore(governance): agents should not panic on peer commits (c00012)`.

### S2 — post f00057 refactor: re-anchor the rule to AGENT-BOOTSTRAP.md

After f00057 compacted `AGENTS.md` and `.github/copilot-instructions.md`
to single pointers, the S1 surfaces became dead weight. S2 moves the
canonical rule into `docs/mcp-vertex/AGENT-BOOTSTRAP.md` § 4.b and
shrinks the SKILL to a pointer + micro-pattern. This makes the rule
survive any future compaction of the host-pointers.

- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `docs/mcp-vertex/proposals/ready/c00012-agents-should-not-panic-on-peer-commits.md`
- **Gate**: `bun run validate` (exit 0).

## dependency graph

S1 is done (commit `6481b0e8`). S2 is the follow-up after the f00057
refactor — it depends on S1's intent (the rule itself) but not on its
exact text. S2 lands the canonical rule in the always-loaded bootstrap
so future compactions of `AGENTS.md` / `copilot-instructions.md` cannot
silently delete it.

## acceptance

- The five-point rule appears verbatim in
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md` § 4.b.
- The new section in
  `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
  contains the `git log -1` micro-pattern (and is now a pointer to the
  bootstrap, not a duplicate of the rule).
- `bun run validate` is green.
- `bun run catalog:check` is green (catalog is unaffected but the
  check must still pass).

## Risks and mitigations

- **Risk: agents do not read AGENTS.md on every turn.** If a host
  keeps the prompt context across many turns, the new section might
  age out of the active window. **Mitigation:** the same rule also
  lives in `copilot-instructions.md` (always-loaded by Copilot Chat)
  and in the multi-agent coordination skill (auto-loaded by the
  proposals plugin). Three independent paths cover the common hosts.
- **Risk: rule is too long to act on in the heat of a turn.** The
  five points collapse to a single sentence: "read the commit, accept
  if it covers your intent, otherwise surgical follow-up, never
  re-plan." That sentence is the practical contract; the five bullets
  are the justification. The skill and copilot-instructions file
  surface only the short version.
- **Risk: agents over-apply and ignore real conflicts.** Point 4
  ("do not widen scope") and point 5 ("trust git diff over memory")
  are the brakes: if the new file is genuinely incompatible with the
  slice, the agent must follow up — not pretend the change is fine.

## notes

- This proposal is **chore** not **docs** because the change touches
  three load-bearing instruction files, not just documentation. The
  kind was chosen so the changelog reflects "behavioural governance"
  rather than "doc polish".
- Doc-only rollback: revert the single commit, run `bun run validate`
  to confirm, done. No data loss, no engine change, no plugin state.
- The same rule has been implicit in the repo for months. This
  proposal makes it explicit so future agents stop paying the
  rediscover-the-rule tax.