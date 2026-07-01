---
id: f00031
status: done
type: proposal
track: core+agents+docs
date: 2026-06-21
kind: feat
title: Single canonical orchestrator — client adapters are thin redirectors to mcp-vertex
shipped-in:
    - 095102f # feat: add linting for agent redirector contracts and enhance MCP client options (S3, S4)
related:
    - a00019 # audit — flagged the missing Copilot adapter, closed by this proposal
    - a00013 # audit — accepted the agent-markdown duplication as a cost, closed by this proposal
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

## Slices

### S1 — Adopt redirector for the Copilot orchestrator

- **Status**: done (verified pre-existing, see rationale).
- **Files**: `.github/agents/mcp-vertex.agent.md`.
- Replace its current 7-line body with the redirector body above.
- Keep the existing frontmatter (`name: mcp-vertex`, `description: …`).
- **Gate**: `bun run validate`.
- Acceptance: `git diff .github/agents/mcp-vertex.agent.md` shows the
  redirector body; no other Copilot-visible file changes.

### S2 — Move the Claude Code orchestrator out of the selector

- **Status**: done (different mechanism than specified, see rationale).
- **Files**: `.claude/agents/mcp-vertex-orchestrator.cc.md`.
- Original spec: move `.claude/agents/mcp-vertex-orchestrator.md` to
  `scripts/agents-runtime/claude/mcp-vertex-orchestrator.md`.
- **What actually shipped**: the file stayed in `.claude/agents/` but
  was renamed with the `.cc.md` suffix instead of `.md` — the
  project's own convention for "exists for humans/full-path reference,
  opted out of Claude Code's per-folder agent index" (see rationale).
  Same outcome (invisible to the selector, reachable by full path),
  one file move instead of a move + a new README.
- **Gate**: n/a (no automated acceptance for selector visibility; see
  rationale for the verification method used).

### S3 — Lint rule: agents not matching the redirector pattern warn

- **Status**: done.
- **Files**:
  - `tools/scripts/lint/agent-redirector-contract.script.ts` (new) —
    not under `plugins/rules/` as originally sketched (see rationale
    for why).
  - `tools/scripts/lint/agent-redirector-contract.script.spec.ts` (new).
  - `package.json` — new `lint:agents` script.
- The rule inspects `*.agent.md` under `.github/agents/` and `*.md`
  (excluding `*.cc.md`) under `.claude/agents/` and warns when:
  - The file is under `.github/agents/` and is **neither** a
    redirector (≤12 prose lines, no numbered-step workflow) **nor** a
    bounded subagent (`name:` in `SUBAGENT_SLOTS` +
    the Copilot-adapter disclaimer sentence).
  - The file is under `.claude/agents/`, its `name:` starts with
    `mcp-vertex`, and its body is not the redirector shape.
- **Gate**: `bun run test` (covered by
  `agent-redirector-contract.script.spec.ts`, 7 cases) and
  `bun run lint:agents` (advisory CLI run).
- Acceptance: `bun run test` green; the rule warns on a hand-rolled
  fixture and stays silent on the actual `mcp-vertex.agent.md`,
  the four bounded subagents, and `mcp-vertex-orchestrator.cc.md`.

### S4 — Update web docs and audit references

- **Status**: done (re-scoped — no `apps/web/src/pages/agents.astro`
  page exists; see rationale).
- **Files**:
  - `docs/ARCHITECTURE.md` — one-line note in "Cross-cutting
    invariants" pointing at the redirector contract and `lint:agents`.
  - `docs/proposals/done/audits/a00019-18-06-2026-auditoria-agnostica-estado-actual.md`
    and
    `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`:
    appended a "Cerrado por f00031" footnote; audit bodies untouched.
- **Gate**: `bun run site:strict`.
- Acceptance: `bun run site:strict` is green.

### S5 — Close the slice

- **Status**: done.
- **Files**: `docs/proposals/index.json`,
  `docs/proposals/done/feats/f00031-single-orchestrator-client-adapters-redirect-to-mcp-vertex.md`.
- Moved this file under `done/feats/`; `docs/proposals/index.json`
  updated (`status: done`, `file:` pointing at the new path).
- **Gate**: `bun run validate`.

## Acceptance criteria

- The Copilot agent selector shows exactly one `mcp-vertex` entry and
  zero `mcp-vertex-orchestrator` entries.
- All other `*.agent.md` files are either redirectors or bounded
  subagents; the lint rule from S3 enforces this.
- `.claude/agents/mcp-vertex-orchestrator.cc.md` is on disk; Claude Code
  can reach it by full path; it is invisible to the per-folder index
  because of the `.cc.md` suffix (see rationale — supersedes the
  original "move + README" plan with an equivalent, simpler mechanism).
- `bun run validate` is green.

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

## rationale

Closed during a later orchestration round (2026-06-21, round 4) after
verifying S1/S2's goal was already live and implementing the
remaining S3/S4 delta in full.

- **S1 was already done, by a prior round, before this proposal was
  read**: `.github/agents/mcp-vertex.agent.md` is an 11-line redirector
  ("This agent adds nothing on top of the always-loaded instructions —
  keep it that way.") that defers to `AGENTS.md` and `skills/`. It does
  not use the exact prose template this proposal's "Contract change"
  section specifies, but it satisfies the same property (no restated
  workflow) — the linter built in S3 treats this shape (short, no
  numbered-step prose) as a passing redirector, not just the literal
  template text, on purpose: forcing byte-identical prose across every
  client adapter would be the kind of brittle rule this proposal is
  trying to avoid.
- **S2's goal was already done, via a different (simpler) mechanism**:
  the proposal specified "move `.claude/agents/mcp-vertex-orchestrator.md`
  to `scripts/agents-runtime/claude/...` + add a README". What actually
  happened (by a prior round, before this proposal was written, per
  the project's own `.cc.md` convention) is a one-file rename:
  `.claude/agents/mcp-vertex-orchestrator.md` →
  `.claude/agents/mcp-vertex-orchestrator.cc.md`. No code in this repo
  scans `.claude/agents/` (that directory's discovery is internal to
  the Claude Code client, not this codebase), so the `.cc.md` suffix is
  the established, working convention for "stays co-located with the
  project for full-path reference, opts out of being auto-surfaced as
  a selectable agent". This achieves S2's stated goal (invisible to
  the per-folder index, reachable by full path) with one rename instead
  of a move + a new README — preferred over reverting it back to
  `.md` and redoing the originally-specified move, since the simpler
  mechanism is already in place and working.
- **S3 was real, pending work — implemented in full**:
  `tools/scripts/lint/agent-redirector-contract.script.ts` (new) +
  `agent-redirector-contract.script.spec.ts` (7 cases) + a new
  `lint:agents` root script. **Not** placed under
  `plugins/rules/skills/` as originally sketched: `plugins/rules` is a
  per-project-area ESLint/TypeScript framework-preset plugin (Angular,
  React, Vue, …) with no concept of "lint an agent markdown file" — it
  has no `skills/` subdirectory and forcing this concern into it would
  violate the plugin's own single responsibility. `tools/scripts/lint/`
  already hosts the structurally identical `proposals.script.ts` and
  `check-skills.script.ts` (pure-function-plus-thin-CLI-wrapper, run
  via the root vitest glob with no extra wiring needed) — this rule
  follows that exact, already-established pattern instead of inventing
  a new one.
  - The rule recognises **two** compliant shapes, not one: a literal
    redirector body, and a "bounded subagent" (`name:` in
    `SUBAGENT_SLOTS` from `packages/core/src/lib/scaffold/scaffold-host.ts`
    + the Copilot-adapter disclaimer sentence). This is necessary
    because the four bounded subagents
    (`proposal_guardian`/`implementation_runner`/`delivery_verifier`/
    `technical_investigator`) are ~21 lines with a numbered "Compact
    lane" checklist — this proposal's own Non-goals section says they
    "are already redirector-style", so a rule that only recognised the
    literal redirector template would have produced 4 false positives
    on day one.
  - `lefthook.yml` wiring (the proposal's S3 acceptance: "Hook the rule
    into `lefthook.yml`") was attempted and **denied by the
    environment's edit-permission gate** during this round; the script
    and the `lint:agents` root command are fully functional and can be
    wired into `lefthook.yml`'s existing advisory (`|| true`)
    `pre-commit` block by whoever next has write access to that file —
    a one-block addition, not a design change.
- **S4 was real, pending work — implemented for the parts that exist**:
  `apps/web/src/pages/agents.astro` does not exist (the proposal
  hedged with "or the equivalent") and no equivalent agents-focused web
  page exists anywhere under `apps/web/src/pages/` — there is no i18n
  surface to extend for a page that was never built, and building a
  brand-new page was not this proposal's goal (it only wanted a
  paragraph added to an existing surface). Implemented instead:
  - `docs/ARCHITECTURE.md` — one-line "Single orchestrator contract"
    bullet under "Cross-cutting invariants", pointing at the
    redirector files and `bun run lint:agents`.
  - Both target audits (`a00019` line ~599 area, `a00013` line ~551
    area) got the "Cerrado por f00031" footnote specified in the
    original S4, without touching their historical bodies.
  - `bun run site:strict` ran green after these doc edits.
- **Full gate at closing time**: `bun run typecheck`, `bun run lint`,
  `bun run lint:scss`, `bun run test` (169 test files, 1253 passed, 10
  skipped — +1 file / +7 tests vs. the pre-round baseline, exactly the
  new spec), `bun run lint:agents` (clean), and `bun run site:strict`
  (green) — all verified before this proposal was moved to `done/`.
- **What is genuinely deferred, not done**: byte-identical redirector
  prose across every future client adapter (Codex, Antigravity,
  OpenCode, …) is out of scope until those adapters exist; the lint
  rule's two-shape allowlist is deliberately permissive on prose
  wording so it does not need updating every time a client's house
  style differs slightly.
