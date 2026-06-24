---
id: f00054
status: ready
type: proposal
kind: refactor
title: Declutter the repo root — a configs/ home for relocatable tool configs and a single centralized .cache/
track: repo-layout+build+tooling+dx
date: 2026-06-24
---

# f00054 — Declutter the repo root: configs/ + centralized .cache/

## Goal

A first impression of the repo root should read as ordered, not as a wall of
dotfiles and cache folders. Today the root mixes: source dirs (good), a dozen
tool config files, several throwaway cache/build dirs, and agent/IDE dotfiles.
This proposal reduces root clutter on two axes, **without breaking any tool,
the editor experience, or CI**:

1. **One cache root.** Every throwaway artefact lives under `.cache/`: our
   project's own state under `.cache/mcp-vertex/`, and each third-party tool's
   cache under `.cache/<tool>/` (e.g. `.cache/astro/`, `.cache/vitest/`,
   `.cache/typedoc/`, `.cache/coverage/`). No more `.astro/`, `coverage/`,
   `.verify-tmp/`, stray `*.tsbuildinfo`, etc. scattered at the root.
2. **A `configs/` home for the configs that can move.** Tool configs that
   support an explicit config path are relocated into `configs/` and the
   tooling is pointed at them; the few that MUST stay at root (because the tool
   or the editor only auto-discovers them there) stay, and the reason is
   documented so the boundary is intentional, not accidental.

The guiding invariant: `bun run validate`, `bun run build`, the VS Code
editor integrations (Biome, TS, Stylelint), and the git hooks all keep working
exactly as before. If a config cannot move without degrading any of those, it
stays at root by design.

## why

The maintainer's read: "muchos archivos de configuración en el root y muchas
carpetas de cache… da impresión de desorden, y si el proyecto da esa impresión
suele serlo." A tidy root is a real DX and credibility signal. The cache
sprawl is pure noise (all gitignored already) and trivially relocatable via
each tool's `cacheDir`/output option. The config sprawl is partly relocatable
and partly fixed by tool discovery rules; making that split explicit is itself
the cleanup.

## non-goals

- **No move of files the toolchain requires at root.** `package.json`,
  `bun.lock`, `.gitignore`, `node_modules/`, `.git/`, `.github/`, `README.md`,
  `LICENSE` stay — moving them breaks npm/bun, git, GitHub, or registry
  expectations. `tsconfig.json` and `biome.json` stay at root because the VS
  Code TS server and the Biome extension auto-discover them there; relocating
  would silently break in-editor types/lint for every contributor.
- **No behavioural change to any tool.** Same lint rules, same test runner,
  same build output contract — only *where the config/cache lives*.
- **No new dependency.** Pure configuration + path moves.
- **No churn of the agent/IDE dirs** (`.claude/`, `.cursor/`, `.codex/`,
  `.continue/`, `.vscode/`) — each agent/editor discovers these at root; they
  stay, though their local/secret files remain gitignored.

## Slices

- global_gate: type

### S1 — Centralize every tool cache under `.cache/<tool>/`
- **Files**: apps/web/astro.config.mjs
- **Files**: vitest.config.ts
- **Files**: vitest.shared.ts
- **Files**: typedoc.json
- **Files**: .gitignore
- **Gate**: type
- **Status**: partial — vitest coverage moved to `.cache/coverage` (reportsDirectory) + gitignore consolidated. FINDING: the rest is tool-constrained — root `.astro/` is Astro's own content/types dir (not relocatable via `cacheDir` in Astro 6), `.verify-tmp/` is created by the external `/verify` skill at runtime (not our config), and `build/`/`dist/`/`site/` are gitignored build OUTPUTS (not caches). So the achievable cache-centralization is narrower than hoped; what remains at root is either tool-owned or already gitignored.
- **Acceptance**:
  - "Astro builds its cache to `.cache/astro/` (astro `cacheDir`), not root `.astro/`."
  - "Vitest coverage writes to `.cache/coverage/` (coverage.reportsDirectory), not root `coverage/`."
  - "Typedoc and any tsbuildinfo write under `.cache/`; `.verify-tmp` content moves under `.cache/verify-tmp/`."
  - "`.gitignore` is updated to the consolidated `.cache/` paths and the old root entries (`.astro/`, `coverage/`, `.verify-tmp/`) are removed."
  - "`bun run validate` + `bun run build` + the web build stay green; no cache dir reappears at root."

### S2 — Move the relocatable tool configs into `configs/`
- **Files**: configs/stylelint.config.mjs
- **Files**: configs/typedoc.json
- **Files**: package.json
- **Gate**: type
- **Status**: pending
- **Acceptance**:
  - "Configs whose tool supports an explicit config path AND whose editor integration is unaffected (stylelint via `--config`, typedoc via `--options`) move to `configs/`; package.json scripts pass the new path."
  - "Each moved config is verified: `bun run lint:scss` and `bun run docs:api` still pass pointing at `configs/`."
  - "Configs that CANNOT move (package.json, bun.lock, .gitignore, tsconfig*.json, biome.json, bunfig.toml, lefthook.yml, vitest.config.ts) stay at root; S3 documents why."

### S3 — Document the root-layout policy
- **Files**: AGENTS.md
- **Gate**: type
- **Status**: pending
- **Acceptance**:
  - "AGENTS.md gains a short 'Repo root layout' section: what lives at root (and the one-line reason each must), that all caches live under `.cache/<tool>/`, and that movable tool configs live in `configs/`."
  - "A reviewer can tell at a glance whether a new root file is justified."

## acceptance

- `bun run validate` and `bun run build` are green after every slice.
- The root no longer shows `.astro/`, `coverage/`, `.verify-tmp/`, or stray
  `*.tsbuildinfo`; all caches are under `.cache/<tool>/`.
- The VS Code Biome/TS/Stylelint integrations and the lefthook git hooks work
  unchanged.
- AGENTS.md documents which files stay at root and why, so the boundary is
  intentional.
