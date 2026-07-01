---
id: f00083
status: done
type: proposal
track: governance+lint+docs
date: 2026-06-28
closed: 2026-06-28
kind: feat
title: Anti-duplication guard — single source of truth for agent rules and proposals
shipped-in:
  - 90655db4 # S1: host-instructions lint
  - 6ae31ac7 # S1: pure lintHostFile refactor
  - f7000791 # S2: bootstrap-canonical lint
  - 1a489181 # S3 + S4: host-hints-fragments lint + lefthook wiring
recan: []
related:
  - f00056 # agent discovery catalog (renderer + bootstrap anchor)
  - c00012 # agents should not panic on peer commits
  - f00074 # loop detector (cross-agent safety net)
ownership:
  - { agent: implementation_runner, task: 'S1: host-instructions lint — verify the 3 host files (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md) all point at AGENT-BOOTSTRAP.md and never enumerate tool / skill / proposal ids' }
  - { agent: implementation_runner, task: 'S2: bootstrap-canonical lint — verify docs/mcp-vertex/AGENT-BOOTSTRAP.md has the canonical 9-section ordering, the anchor preamble, and no duplicate H2s' }
  - { agent: implementation_runner, task: 'S3: host-hints fragments lint — verify the 3 generated fragments under docs/mcp-vertex/host-hints/ also point at the bootstrap and never enumerate content' }
  - { agent: implementation_runner, task: 'S4: wire the new lints into bun run validate and lefthook pre-commit; close the gate' }
globalGate: validate
acceptance:
  - { command: bun run lint:host-instructions, expect: exit0 }
  - { command: bun run lint:bootstrap-canonical, expect: exit0 }
  - { command: bun run lint:host-hints-fragments, expect: exit0 }
  - { command: bun run test tools/scripts/lint/host-hints-fragments.script.spec.ts, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# f00083 — Anti-duplication guard for agent rules and proposals

## goal

Make it impossible (or at least noisy) for a parallel agent to re-introduce
host-specific rules, skill / tool / proposal enumerations, or duplicate
sections that the canonical bootstrap already owns. Today, every time a
formatter or peer agent touches `AGENTS.md`, `CLAUDE.md`, or
`.github/copilot-instructions.md`, the host file drifts back toward "include
the rule inline" — which is exactly what f00056 S4 set out to prevent.

## why

Observed drift in the 2026-06-28 session (this proposal's own session):

- The renderer of `docs/mcp-vertex/host-hints/*.generated.md` originally
  enumerated skills / tools / proposals; the central bootstrap landed
  (6a79349b) but the renderer kept enumerating until 6cc4e7bf rewrote it
  as a constant-fragment generator. The drift surfaced as a stale catalog
  reference in every host fragment.
- A peer agent re-anchored `CLAUDE.md` to `AGENTS.md` instead of the
  bootstrap. The chain `CLAUDE.md → AGENTS.md → bootstrap` is one hop
  too many; every other host points directly at the bootstrap, so the
  hop creates a second source of truth.
- A peer agent re-merged duplicate `## acceptance` and
  `## risks and mitigations` sections into `x00074` while merging the
  f00074 S1+S2+S3+S4 status. The proposal-lint caught it on the next
  validate, but only after the broken proposal had been pushed to
  develop.
- The host-instructions files contain no guard against a future peer
  agent re-introducing inline status-marker rules, inline keep-main-
  thread-cheap rules, or skill ids. Nothing in the repo says "this file
  must not contain X" — only the bootstrap says "this file must point
  at the central source".

## non-goals

- This proposal does **not** rewrite the existing host files. They are
  already correct (post-6a79349b + 6cc4e7bf). The guard is preventative.
- It does **not** introduce a new file format for host instructions. The
  three host files (AGENTS.md / CLAUDE.md / .github/copilot-instructions.md)
  stay as they are; the lint just enforces the contract.
- It does **not** lock down proposal contents. The proposal linter (S12
  in the proposal plugin) already enforces the canonical scaffold; we
  are extending it with a stronger cross-folder duplicate-id check.
- It does **not** enforce the rendering inside the host-hint fragments
  to match the bootstrap. The renderer in 6cc4e7bf is byte-stable; the
  lint just verifies the generated content respects the contract.

## Slices

### S1 — host-instructions lint
- **Files**: `tools/scripts/lint/host-instructions.script.ts`, `tools/scripts/lint/host-instructions.script.spec.ts`, `package.json`
- **Status**: done (commit `90655db4` + `6ae31ac7`)
- **Gate**: `bun run lint:host-instructions`
- **Acceptance**:
  - The lint walks the three host files: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`. (Host files in `configs/external/<host>/` are out of scope — those are user-installed and not part of the canonical contract.)
  - Each host file MUST contain a top-level link to `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (relative or absolute path). Without the link, the host is not anchored and the lint fails.
  - The host file MUST NOT contain any of:
    - backtick-quoted skill ids: `\`[a-z][a-z0-9-]+-[a-z-]+\`` (e.g. `\`mcp-vertex-operator\``)
    - backtick-quoted tool names: `\`mcp-vertex_[a-z_]+\`` other than the three bootstrap entry points (`mcp-vertex_overview`, `mcp-vertex_agent_catalog`, `mcp-vertex_agent_bootstrap`).
    - backtick-quoted proposal ids: `\`[a-z]\d{5}\`` (e.g. `\`f00056\``).
  - The lint outputs a per-file `BLOCKING` list with line numbers and a `next-action` ("remove the line, move the rule to the bootstrap, or downgrade to a warning with a one-line justification").
  - Spec covers 4 cases: a clean host file (passes), a host file missing the bootstrap link (fails), a host file enumerating a skill id (fails with the right line number), a host file that legitimately mentions `mcp-vertex_overview` (passes).

### S2 — bootstrap-canonical lint
- **Files**: `tools/scripts/lint/bootstrap-canonical.script.ts`, `tools/scripts/lint/bootstrap-canonical.script.spec.ts`, `package.json`
- **Status**: done (this turn)
- **Gate**: `bun run lint:bootstrap-canonical`
- **Acceptance**:
  - The lint walks `docs/mcp-vertex/AGENT-BOOTSTRAP.md` and asserts:
    - The preamble anchor string is present: `This file is the only place agent rules live`.
    - The H2 sections appear in the canonical order defined in the lint's `CANONICAL_SECTIONS` constant: `Table of contents → 1 Orient first → 2 Route work → 3 Bootstrap prompt → 4 Workflow loop → 5 Definition of done → 6 Invariants → 7 Repo rules → 8 Host appendices`.
    - No `## ` heading is duplicated (the table of contents and the per-host appendix anchors would collapse on a duplicate).
  - The lint does **not** reuse the proposal-plugin scaffold: the bootstrap has its own 9-section structure (orient → route → prompt → loop → DoD → invariants → repo rules → host appendices + a table of contents), which is different from the proposal's `goal → why → ...` scaffold. The two files have different contracts; they are not the same scaffold.
  - Sub-headings inside the last canonical section (e.g. `## 8.1 Copilot`, `## 8.2 Claude`, `## 8.3 generic`) do not break the order check — they are not in the canonical list, so the lint walks past them.
  - Spec covers: a clean bootstrap (passes), a bootstrap with a missing canonical section (fails with `missing-section`), a bootstrap with sections in the wrong order (fails with `out-of-order` and the canonical index), a bootstrap with a duplicate H2 (fails with `duplicate-section` and the two line numbers), a bootstrap missing the anchor (fails with `missing-anchor`).

### S3 — host-hints fragments lint
- **Files**: `tools/scripts/lint/host-hints-fragments.script.ts`, `tools/scripts/lint/host-hints-fragments.script.spec.ts`, `package.json`
- **Status**: done (this turn)
- **Gate**: `bun run lint:host-hints-fragments`
- **Acceptance**:
  - The lint walks `docs/mcp-vertex/host-hints/{copilot-instructions,claude,agents}.generated.md`.
  - Each fragment MUST contain a reference to `docs/mcp-vertex/AGENT-BOOTSTRAP.md` and MUST NOT enumerate skill / tool / proposal ids (same rules as the host-instructions lint, restricted to the three bootstrap entry points for tool names).
  - The lint is read-only: it does not call the renderer, just verifies the output. This makes it cheap to run on every validate.
  - Spec covers: clean fragments (pass), a fragment whose regeneration was forgotten (fails with "stale: run `bun run catalog:hints`"), a fragment that has drifted (fails with the offending line).

### S4 — wire into lefthook (not validate)
- **Files**: `lefthook.yml`, `package.json`
- **Status**: done (this turn)
- **Gate**: `bun run validate` exits 0; `lefthook run pre-commit` runs the 3 new hooks
- **Acceptance**:
  - `lefthook.yml` has three new `pre-commit` commands wired as **BLOCKING** (no `|| true`):
    - `bootstrap-canonical-discipline` — `glob_filter` matches `docs/mcp-vertex/AGENT-BOOTSTRAP.md` only; runs `bun run lint:bootstrap-canonical`.
    - `host-hints-fragments-discipline` — `glob_filter` matches the 3 host-hint fragments; runs `bun run lint:host-hints-fragments`.
    - `host-instructions-discipline` is **not** added: `lint:host-instructions` is already in the `bun run validate` chain (kept there for the slow full-tree walk), and the lefthook design prefers the file-scoped check for the bootstrap/fragment pair.
  - Each hook prints a clear `next-action` (e.g. "Run `bun run catalog:hints` to regenerate" or "Move the rule to the bootstrap") so the agent sees what to fix.
  - The 3 lints are exposed as `bun run lint:<name>` scripts (so a developer can invoke them ad hoc) but are NOT added to the `bun run validate` aggregator (per f00086's discipline: file-specific lints belong in lefthook, not in the universal validate chain).
  - Bypass: `LEFTHOOK_BYPASS=1 git commit ...` is documented in each hook's blocker text.

## acceptance

- The three lints run in `bun run validate` and exit 0 on the current
  develop (after the spec files are added).
- A peer agent that edits `AGENTS.md` to add an inline skill id is
  blocked by the pre-commit hook with a clear next-action message.
- A peer agent that moves a section in the bootstrap to the wrong order
  is blocked by the bootstrap-canonical lint.
- A peer agent that hand-edits a host-hints fragment to add content
  is blocked by the host-hints-fragments lint with a "regenerate" hint.

## notes

- The lints are intentionally narrow. They do not try to detect every
  possible drift — only the specific patterns we have observed
  regressing in the 2026-06-28 session. The pattern is "concrete
  regression → add a guard" rather than "comprehensive policy".
- The canonical-scaffold knowledge lives in the proposal plugin
  (`lintProposalMarkdown`). The host-instructions lint imports it
  rather than re-declaring the heading list, so a future change to
  the scaffold automatically applies to all three lints.
- The pre-commit hook is opt-in via a label so it does not fire on
  every commit; only commits that touch a host file trigger it. This
  avoids the "false alarm on every biome fmt" failure mode that has
  made other repos disable their pre-commit guards.
- The host-instructions lint does not enforce a byte budget on the
  host files. A long AGENTS.md that still points at the bootstrap is
  fine. The cost we are paying for "agent rules in two places" is the
  divergence risk, not the size.
- A future slice (out of scope) could replace the lints with a CI
  step that regenerates the host files from a single template. The
  lints are the precondition for that: they verify the human-edited
  file respects the contract that the template would enforce.