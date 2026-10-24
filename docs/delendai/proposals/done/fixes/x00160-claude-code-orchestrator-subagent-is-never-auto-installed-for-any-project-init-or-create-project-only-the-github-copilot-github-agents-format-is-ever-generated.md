---
id: x00160
title: "Claude Code orchestrator subagent is never auto-installed for any project (init or create_project) — only the GitHub Copilot .github/agents format is ever generated"
kind: fix
status: done
type: proposal
track: cli+init+scaffold+claude-code+self-hosting+adopter-experience
date: 2026-07-27
---

# x00160 — Claude Code orchestrator subagent is never auto-installed for any project (init or create_project) — only the GitHub Copilot .github/agents format is ever generated

## Goal

Every host-instruction file (AGENT-BOOTSTRAP.md, CLAUDE.md pointers, dozens of proposal docs) tells a Claude Code session to "use the mcp-vertex-orchestrator subagent" for non-trivial work. Nothing in `mcpv init` or `create_project`/`scaffold` ever creates a Claude Code-native subagent definition (`.claude/agents/*.md`) — only the GitHub Copilot format (`.github/agents/*.agent.md`) is ever emitted, in either flow. Fix the gap so a Claude Code adopter (including mcp-vertex's own dev repo) actually gets the subagent the docs keep telling it to use.

## why

User-reported 2026-07-27/28, during a stabilization session, after independently noticing this Claude Code session had no "mcp-vertex-orchestrator" subagent available despite AGENT-BOOTSTRAP.md §8.2 unconditionally instructing every Claude Code host to delegate to one. Reproduced directly: this very mcp-vertex repository's own `.claude/` directory has no `agents/` subdirectory at all (`find .claude -iname agents` returns nothing) — even mcp-vertex's own dev environment, which should be the reference dogfooding example, does not have the subagent the bootstrap doc tells every session to use. Traced the root cause to two independent gaps: (1) `packages/cli/src/lib/init/` (the `mcpv init` adoption flow most users run) never references `scaffoldAgentFile`, `SUBAGENT_SLOTS`, or any `.claude/agents` path at all — `init-render.service.ts` only ever writes `.github/agents/mcp-vertex-<role>.agent.md` (Copilot's custom-agent format). (2) `packages/core/src/lib/scaffold/scaffold-host.ts` (the separate `create_project`/`scaffold` greenfield path) DOES generate an orchestrator + subagent set via `scaffoldAgentFile`, but hardcodes the same `.github/agents/${slot}.agent.md` path — so even a user who explicitly scaffolds a brand-new project through that tool, intending to use Claude Code, still never gets a `.claude/agents/*.md` file. Every Claude Code adopter of mcp-vertex — via either onboarding path — is left with host-instruction docs that reference a subagent nothing ever creates.

## non-goals

- Redesigning the GitHub Copilot .agent.md generation — it works and stays as-is.
- Auto-detecting which host(s) a project uses and only emitting the relevant format — out of scope for this fix; emit the Claude Code format unconditionally alongside the existing Copilot one (mirroring how AGENT-BOOTSTRAP.md already has a per-host appendix approach), and let a future proposal add host-selection UX if the dual output becomes noisy.
- Auditing every other host's subagent/custom-agent convention (Cursor, Aider, Continue, Codex) — flagged as a related follow-up in notes, not in scope here.
- Changing the mcp-vertex-orchestrator's actual responsibilities/instructions — only the file its content lands in and the path it lands at.

## Slices

- global_gate: type

### S1 — scaffold-host.ts: emit .claude/agents/<slot>.md alongside the existing .github/agents/<slot>.agent.md
- **Status**: done
- **Implementation**: added `scaffoldClaudeAgentFile` (exported from `@mcp-vertex/core/public`) emitting `.claude/agents/<kebab-slot>.md` — `SUBAGENT_SLOTS` uses snake_case (`proposal_guardian`) but Claude Code's `name` requires kebab-case, so the existing `kebab()` helper converts it. Verified against Claude Code's real subagent contract (code.claude.com/docs/en/sub-agents, confirmed live via the claude-code-guide agent, not guessed): `name` + `description` required, `tools` (when present) is a comma-separated STRING not a YAML list, `model` accepts `sonnet`/`opus`/`haiku`/`fable`/`inherit`/a full `claude-*` id. `tools` is deliberately omitted (inherits all) — the Copilot variant's tool vocabulary (`read`, `search`, `mcp-project-<prefix>/*`, …) doesn't map to Claude Code's own tool names, and an invented mapping would trade one inaccuracy for another. `model` is only emitted when `options.defaultModel` matches a recognised alias, otherwise omitted (defaults to `inherit`) rather than shipping an invalid value.
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`
- **Gate**: `bunx tsc --noEmit` clean; `bun test packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts` — 22/22 pass (was 20); `bun test packages/core/tests --filter scaffold` — 1221/1221 pass.

### S2 — init flow: write .claude/agents/mcp-vertex-orchestrator.md during mcpv init, not just the .github/agents variant
- **Status**: done
- **Implementation**: added `renderClaudeAgentFile` in `init-render.service.ts`; `renderAgentFiles` now emits both the Copilot AND Claude Code file per role from the same `IAgentDescriptor` list (one `generateAgentMd` toggle controls both, per the updated test). The fallback catalog's `role` field is already kebab-case (`proposal-guardian`), unlike scaffold-host's snake_case slots, so no conversion was needed here. Same `tools`-omission reasoning as S1 (the catalog's `PROP_*`-prefixed placeholder ids match neither Claude Code's built-in tools nor its `mcp__<server>__<tool>` naming for MCP tools).
- **Live verification (the actual repro this proposal opened with)**: ran `bun packages/cli/src/index.ts init:default --dry-run` against mcp-vertex's own repo — it now lists `.claude/agents/mcp-vertex-orchestrator.md` (and the other 4 roles) as files it would create. Wrote just those 5 files directly (not the full init:default, to avoid its unrelated `--overwrite` side effects on config/skills/scaffold) — `.claude/agents/` now exists in mcp-vertex's own dev repo for the first time, closing the exact gap that motivated this proposal.
- **Files**: `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-render.service.spec.ts`
- **Gate**: `bunx tsc --noEmit` clean; `bun test packages/cli/src/lib/init` — 148/148 pass.
  - "Existing init-render.service tests for the .github/agents output are unchanged and still green."

## acceptance

- scaffoldAgentFile (or a new sibling) returns/writes both the existing .github/agents/<slot>.agent.md AND a new .claude/agents/<slot>.md for every slot in SUBAGENT_SLOTS + the orchestrator.
- The .claude/agents/<slot>.md frontmatter matches Claude Code's actual subagent contract (name, description, tools, model) — verified against Claude Code's documented subagent format, not guessed.
- Existing scaffold-host tests for the .github/agents output are unchanged and still green.
- Running `mcpv init` (or init-default) on a fresh workspace with generateAgentMd: true produces both .github/agents/mcp-vertex-<role>.agent.md AND .claude/agents/mcp-vertex-<role>.md for every role in the live agent catalog (or the locale-keyed fallback).
- Re-running init-default in mcp-vertex's OWN repo actually creates .claude/agents/mcp-vertex-orchestrator.md, closing the gap that motivated this proposal.
- Existing init-render.service tests for the .github/agents output are unchanged and still green.
