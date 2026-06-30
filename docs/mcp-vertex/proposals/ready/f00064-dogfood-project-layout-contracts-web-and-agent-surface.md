---
id: f00064
status: ready
type: proposal
track: dogfood+repo-layout+contracts+web+agents
date: 2026-06-25
kind: feat
title: Dogfood real — project layout, contracts split, web completeness, and agent tool/skill surface
shipped-in: []
recan: []
related:
    - r00004 # root declutter and cache consolidation
    - f00055 # web page audit and responsive fixes
    - f00056 # agent discovery tool/skill catalog
    - f00057 # skill unification and plugin coverage wiring
ownership:
    - { agent: implementation_runner, task: 'S1: move every safely relocatable root config into config/ and wire package scripts/editor-safe explicit paths' }
    - { agent: implementation_runner, task: 'S2: finish cache centralization under .cache/mcp-vertex and document every root exception with a tool constraint' }
    - { agent: implementation_runner, task: 'S3: enforce contracts/{interfaces,constants} naming for interfaces, exported types, and constants in touched packages/plugins' }
    - { agent: web_runner, task: 'S4: fix responsive header overlap and marquee layout across mobile/tablet/desktop screenshots' }
    - { agent: web_runner, task: 'S5: complete the home plugins surface and remove incomplete/English-only page gaps through the PageSpec/i18n path' }
    - { agent: host_runner, task: 'S6: expose loaded mcp-vertex tools, plugins, and skills as host-visible command/input affordances for Claude, Codex, Copilot, OpenCode, and VS Code' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00064 — Dogfood real: project layout, contracts split, web completeness, and agent surface

## Goal

Make this repository obey the same project architecture it recommends to downstream mcp-vertex users. The first dogfood correction already moved the live proposal store to `docs/mcp-vertex/proposals`, enabled `agentWorktree`, moved new agent worktrees under `.cache/mcp-vertex/.worktrees`, and moved loop handoff packets to `.cache/mcp-vertex/handoff`.

This proposal tracks the remaining work that should not be rushed in the same slice: root config relocation, cache cleanup, contract file organization, web responsive/content completeness, and host-visible tools/skills.

## Why

The repository is infrastructure for other agents, so deviations here become bad examples elsewhere. If this repo keeps a special `docs/proposals` path, root scratch folders, unstructured exported contracts, or incomplete web/i18n surfaces, users copy the exception rather than the architecture.

The work is broad enough to require separate slices and visual verification, especially for the web changes and for host integrations where Claude, Codex, Copilot, OpenCode, and VS Code have different command/input affordances.

## Why This Design

The proposal splits mechanical filesystem cleanup from behavior changes:

- S1 and S2 are layout/config/cache work and should preserve behavior.
- S3 is code organization and should be applied only where imports can be updated cleanly.
- S4 and S5 are user-visible web fixes and require screenshots/build checks.
- S6 is host/runtime discovery and should consume the live tool registry and skill manifest, not maintain a second list.

## Non-goals

- No blind move of root config files when the tool/editor requires root auto-discovery.
- No rewrite of historical closed proposal prose just to update old path mentions.
- No landing-page redesign unrelated to the overlapping header, marquee, plugin completeness, or page/i18n gaps.
- No custom host-only tool list; the surface must be derived from loaded plugins/tools/skills.

## Architecture

The target dogfood layout is:

```text
.cache/mcp-vertex/
  .worktrees/
  handoff/
  verify/
config/
  <only configs whose tools accept explicit paths without breaking editor integration>
  external/
    <tool>/
      <canonical source for external-agent config when a tested root bridge exists>
docs/mcp-vertex/
  examples/
  proposals/
```

Runtime-generated state belongs under `.cache/mcp-vertex/**`. Human-authored mcp-vertex state belongs under `docs/mcp-vertex/**`. Root files remain only when the tool, package manager, editor, or host discovers them there by convention.

External agent/IDE configs are evaluated per host:

- `.github/` workflows, community health files, `CODEOWNERS`, Dependabot config, Copilot instructions, and GitHub agent files are root-discovered by GitHub/GitHub Copilot; they stay at `.github/**` unless a tested root bridge preserves GitHub behavior.
- `.vscode/`, `.cursor/`, `.claude/`, `.codex/`, and `.continue/` may move their canonical authored source to `config/external/<tool>/` only if the root path remains a working discovery point through a tested include/stub/symlink or explicit host setting. `.continue/` is the Continue.dev workspace assistant config, not mcp-vertex runtime state.
- If a host does not support includes and ignores symlinks, the root file is not clutter; it is the integration boundary.
- Astro's configurable `cacheDir` belongs in `.cache/astro/`; its root `.astro/`
  generated type metadata remains gitignored unless Astro supports relocating it
  without breaking editor/type-check integration.
- Runnable adoption examples belong under `docs/mcp-vertex/examples/*` and stay
  executable through explicit `package.json#workspaces` and `tsconfig` globs.

## Slices

### S1 — Root config relocation audit and safe moves

- **Status**: done
- **Files**: AGENTS.md, package.json, config/**
- **Gate**: bun run validate
- **Acceptance**:
  - Every root config is classified as `must-stay-root`, `moved-to-configs`, or `blocked-by-tool`.
  - Any moved config has all package scripts updated to pass an explicit config path.
  - External-agent configs use `config/external/<tool>/` as canonical source only when the root discovery bridge is verified for that host.
  - Editor-discovered configs stay at root unless an extension-safe override or bridge exists.
- **Landed**: The mechanical relocation was already in the tree —
  `config/typedoc.json` (wired via `package.json#scripts.docs:api`), and
  `config/external/{aider,cursor,mcp}` with root symlink bridges for
  `.aider.conf.yml` and `.cursorrules` (git mode 120000). This slice closed
  the two remaining gaps: (1) `config/external/README.md` wrongly listed
  `.mcp.json` as a symlink bridge — it is a real root file (git mode 100644,
  `--workspace=.` relative args) intentionally divorced from the
  `${workspaceFolder}` variant under `config/external/mcp/`; the README now
  classifies it as root-discovered. (2) Added the explicit
  `must-stay-root`/`moved-to-config`/`bridged` classification table to the
  AGENTS.md "Repo root layout" section so every root config has a recorded
  class. Reconciled with f00103 (no CLI/init/preset surface touched).

### S2 — Cache centralization cleanup

- **Status**: pending
- **Files**: .gitignore, AGENTS.md, tools/scripts/verify/**, plugins/**/README.md
- **Gate**: bun run validate
- **Acceptance**:
  - New generated mcp-vertex state writes under `.cache/mcp-vertex/**`.
  - Legacy root scratch dirs remain ignored only as compatibility, not as documented active defaults.
  - The repo root layout documentation names every remaining root generated directory and why it cannot move.

### S3 — Contracts interfaces/constants split

- **Status**: pending
- **Files**: packages/**/src/lib/**, plugins/**/src/lib/**
- **Gate**: bun run validate
- **Acceptance**:
  - Exported interfaces live in `contracts/interfaces/*.interface.ts` where the local package/plugin already has a contracts boundary.
  - Shared constants live in `contracts/constants/*.constant.ts`.
  - Barrel exports preserve public imports; internal imports are updated without circular dependencies.

### S4 — Header and marquee responsive repair

- **Status**: pending
- **Files**: apps/web/src/components/**, apps/web/src/styles/**, apps/web/tests/**
- **Gate**: bun run site:strict
- **Acceptance**:
  - Header content does not overlap at mobile, tablet, laptop, or wide desktop widths.
  - The marquee has stable height/spacing and does not clip or collide with adjacent sections.
  - Playwright screenshots or equivalent visual checks cover at least 390px, 768px, 1024px, and 1440px widths.

### S5 — Complete web plugin/page/i18n surface

- **Status**: pending
- **Files**: apps/web/src/pages/**, apps/web/src/components/**, apps/web/src/i18n/**, apps/web/src/data/**
- **Gate**: bun run site:strict
- **Acceptance**:
  - The home plugin section reflects the live plugin registry and has complete copy/assets for shipped plugins.
  - Pages that currently exist only in English are converted, hidden, or routed through the PageSpec/i18n workflow.
  - `site:strict` fails when a user-visible page is missing required translated content.

### S6 — Host-visible tools, plugins, and skills

- **Status**: pending
- **Files**: packages/client/**, packages/ui-extension/**, extensions/vscode/**, skills/manifest.json, apps/web/src/data/**
- **Gate**: bun run validate
- **Acceptance**:
  - A generated catalog exposes loaded tools, plugins, and skills from the live registry/manifests.
  - Claude, Codex, Copilot, OpenCode, and VS Code integrations can surface that catalog in their command/input affordance without hand-maintained duplicates.
  - Disabled/missing plugins and skills are represented explicitly so users can tell what is available in the current repo.

## Dependency Graph

S1 -> S2 -> S3
S4 -> S5
S6 depends on f00056 and f00057.

## Acceptance

- `bun run validate` is green.
- `docs/mcp-vertex/proposals/index.json` includes this proposal after `sync_proposals`.
- Root generated state defaults are under `.cache/mcp-vertex/**`.
- The web and host-tool catalog gaps are tracked as executable slices, not loose chat notes.

## Risks and Mitigations

- **Risk**: moving a root config breaks editor integration.
  **Mitigation**: require a documented `must-stay-root` classification unless an explicit editor-safe path exists.
- **Risk**: moving contract files creates noisy import churn.
  **Mitigation**: apply S3 package by package and preserve public barrels.
- **Risk**: visual fixes regress another breakpoint.
  **Mitigation**: require screenshot coverage across representative widths.
