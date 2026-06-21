---
id: f00031
status: ready
type: proposal
track: core+agents+docs
date: 2026-06-21
kind: feat
title: Single canonical orchestrator — client adapters are thin redirectors to mcp-vertex
---

# f00031 — Single canonical orchestrator — client adapters are thin redirectors to mcp-vertex

## Goal

Make **mcp-vertex itself** the only source of truth for the orchestrator
contract. Every client adapter (Copilot, Claude Code, Codex, Antigravity,
OpenCode, …) becomes a **thin redirector** whose only job is:

1. Detect the runtime (Copilot, Claude Code, …).
2. Load the canonical contract from `mcp-vertex_overview` /
   `mcp-vertex_continue_proposal` / `mcp-vertex_auto_work` /
   `mcp-vertex_delegate`.
3. Forward every meaningful instruction to those tools instead of
   restating the workflow in agent markdown.

After this proposal lands, the **VS Code agent selector must show a
single `mcp-vertex` entry**, never a per-client clone. Per-client names
like `mcp-vertex-orchestrator` either disappear from the selector or
become pure redirectors that load mcp-vertex on first call.

## Why

- The user already pays the cost of dogfooding: the same workflow is
  restated in `.github/agents/mcp-vertex.agent.md` and in
  `.claude/agents/mcp-vertex-orchestrator.md`, with the second copy
  drifting (50 lines, bucle, mientras el primero son 7 líneas). Both
  end up in the Copilot selector and feel redundant.
- `mcp-vertex_overview` already returns `recommendedNextAction`; that
  payload is the *real* orchestrator. Any agent markdown that restates
  the workflow in prose is, by definition, a stale copy.
- The audit `a00019` (line 599) flagged the absence of a Copilot
  adapter; `a00013` (line 551) accepted the duplication as the price of
  dogfooding. This proposal removes that price: the contract lives in
  mcp-vertex, and adapters only bind to it.
- The scaffolder in
  [`packages/core/src/lib/scaffold/scaffold-host.ts:30`](../scaffold/scaffold-host.ts#L30)
  already declares the subagent slots
  (`proposal_guardian`, `implementation_runner`, `delivery_verifier`,
  `technical_investigator`) and the orchestrator slot. We extend it so
  it can also emit a redirector for any client that wants one.

## Non-goals

- Changing the public MCP surface (`mcp-vertex_overview` / `auto_work` /
  `continue_proposal` / `delegate` / `agent_lock` / `close_slice`).
  The orchestrator contract stays where it is.
- Replacing the four bounded subagents added in the previous slice.
  They are already redirector-style; this proposal only formalises the
  pattern.
- Forcing Claude Code to drop its native `.claude/agents/` folder. We
  keep the folder but only the **canonical** file (the one matching
  mcp-vertex's slot) lives there; everything else is moved out of the
  Copilot selector's view.
- i18n on the new redirector body — the body is intentionally a few
  lines, English is fine for v1.

## Contract change

A "redirector" agent is defined as an `*.agent.md` whose body contains
exactly these lines (modulo whitespace and the project's `mcp-vertex`
namespace prefix):

```text
# <slot> (redirector)

This file is a thin redirector. The canonical contract lives in the
`mcp-vertex` MCP server. On the first call of every turn, invoke
`mcp-vertex_overview` and follow its `recommendedNextAction`. Do not
restate the workflow here.
```

A linter rule (see S3) flags any agent file in `.github/agents/` that is
**not** a redirector or a bounded subagent, and warns on files under
`.claude/agents/` whose `name:` is `mcp-vertex*` but whose body is not a
redirector.

## Slices

### S1 — Adopt redirector for the Copilot orchestrator

- File: `.github/agents/mcp-vertex.agent.md`.
- Replace its current 7-line body with the redirector body above.
- Keep the existing frontmatter (`name: mcp-vertex`, `description: …`).
- `bun run validate` stays green.
- Acceptance: `git diff .github/agents/mcp-vertex.agent.md` shows the
  redirector body; no other Copilot-visible file changes.

### S2 — Move the Claude Code orchestrator out of the selector

- Move `.claude/agents/mcp-vertex-orchestrator.md` to
  `scripts/agents-runtime/claude/mcp-vertex-orchestrator.md`.
- The destination is outside `.github/agents/` and outside
  `.claude/agents/`, so it is invisible to both the Copilot selector and
  the Claude Code per-folder index. Claude Code can still reference it
  by full path if it needs to.
- Add a `scripts/agents-runtime/claude/README.md` (≤30 lines) explaining
  the move: "redirectors live with the project; the canonical contract
  is in mcp-vertex".
- Acceptance: `git status --porcelain` shows a rename (R) for the
  source path and a new file for the README; no other file changes.

### S3 — Lint rule: agents not matching the redirector pattern warn

- New file:
  `plugins/rules/skills/agent-redirector-contract.md`
  (or the appropriate location under `plugins/rules/`).
- The rule inspects `*.agent.md` under `.github/agents/` and
  `.claude/agents/` and emits a warning when:
  - The file is under `.github/agents/` and its body contains prose
    longer than 12 lines (i.e. is a hand-rolled workflow instead of a
    redirector).
  - The file is under `.claude/agents/` and its `name:` starts with
    `mcp-vertex` but its body is not the redirector body.
- Hook the rule into `lefthook.yml` so it runs in `pre-commit`.
- Tests in `plugins/rules/tests/` cover both cases plus a "matched"
  positive case.
- Acceptance: `bun run test` green; the rule warns on a hand-rolled
  `.github/agents/example.agent.md` fixture and stays silent on the
  actual `mcp-vertex.agent.md` after S1 lands.

### S4 — Update web docs and audit references

- Files:
  - `apps/web/src/pages/agents.astro` (or the equivalent): add a short
    paragraph explaining the redirector model. Update the i18n keys
    for **all 12 languages** in
    [`apps/web/src/i18n/ui.ts`](../../apps/web/src/i18n/ui.ts).
  - `docs/ARCHITECTURE.md`: add a one-line note in the "agents"
    section pointing at the redirector contract.
  - `docs/proposals/done/audits/a00019-18-06-2026-…md` and
    `docs/proposals/done/audits/a00013-16-06-2026-…md`: append a "Closed
    by f00031" footnote; do not rewrite the audit bodies.
- Acceptance: `bun run site:strict` is green; all 12 i18n keys present.

### S5 — Close the slice

- Conventional commit: `feat(agents): make mcp-vertex the single
  orchestrator; per-client adapters become redirectors (f00031)`.
- Update `docs/proposals/index.json` to move this file under
  `done/feats/`.
- `bun run validate` is green.

## Acceptance criteria

- The Copilot agent selector shows exactly one `mcp-vertex` entry and
  zero `mcp-vertex-orchestrator` entries.
- All other `*.agent.md` files are either redirectors or bounded
  subagents; the lint rule from S3 enforces this.
- `scripts/agents-runtime/claude/mcp-vertex-orchestrator.md` is on disk
  with a README; Claude Code can reach it by full path.
- `bun run validate` is green.
- `git log --oneline` shows one Conventional Commit per slice.

## Risks

- **VS Code cache**: a stale cache may still show the old names. The
  fix is `Developer: Reload Window`; document it in the S4 copy.
- **Other agents depending on `.claude/agents/mcp-vertex-orchestrator.md`**
  by relative path. The only known reference is in archived audits
  (`a00019`, `a00013`); S4 covers them.
- **Drift between the redirector and mcp-vertex**: if mcp-vertex
  changes its contract, the redirector must follow. The lint rule in
  S3 does not enforce that; we accept the risk because the redirector
  body is intentionally tiny (≤8 lines) and trivial to regenerate.
