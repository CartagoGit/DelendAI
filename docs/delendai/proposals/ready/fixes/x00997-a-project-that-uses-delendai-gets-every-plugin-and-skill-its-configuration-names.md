---
id: x00997
title: "A project that uses delendai gets every plugin and skill its configuration names"
kind: fix
status: ready
type: proposal
track: distribution
date: 2026-10-31
---

# x00997 — A project that uses delendai gets every plugin and skill its configuration names

## goal

A project outside this monorepo receives everything delendai promises it: each skill reaches its hosts, and each plugin its configuration names loads. The skills' source stays with the package that owns them, and the copies each host reads stay generated.

## why

The owner asked on 2026-10-31 why the skills are ignored by git, and whether another repository would receive them. Driving `init` and the server in a throwaway project gave this:

- The source is tracked: `packages/core/skills` and `plugins/*/skills`. What git ignores is the host copies (`.claude/skills`, `.github/skills`, `.agents/skills`, `.opencode/skills`), rebuilt at every start from the active plugins. Moving the source to `docs/` would make the problem worse, since `docs/` is not in any package's `files`.
- That is exactly the gap two skills fell into: `shell-status` and `shell-fallback` lived in `docs/delendai/skills`, against that folder's own README, and reached no consumer.
- `plugins/commit-policy` has a `skills/` folder and no `skills` in `files`, so `read-stderr-storm` would never be published.
- With the plugin packages in the project's `node_modules`, the server installed 18 skills in each host folder. Without them it installed none, because `init` configures 26 plugins while `@delendai/cli` depends on two of them, and `init` adds no dependency.
- `@delendai/cli` and `@delendai/core` answer 404 on npm: nothing is published yet, so the `bunx` entry `init` writes cannot start in a foreign project today. Publishing stays the owner's deliberate step of `release.yml`.

The CLI now depends on the 27 plugins of `swarm`, `init`'s default preset, and a spec keeps the two lists in step (2026-10-31). That reaches projects with no package manifest too, where `bunx` is the only route, without installing the whole catalogue. A plugin outside the preset still needs installing by hand. S3 stays open until packed tarballs prove it.

## non-goals

- Tracking the host copies: they are generated, and each is rebuilt at every start.
- Publishing to npm, which is the release's step.

## slices

- global_gate: type

### S1 — Every skill folder is published
- **Status**: pending
- **Files**: `plugins/commit-policy/package.json`, `tools/scripts/lint/skills-are-published.spec.ts`, `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`
- **Gate**: type
- acceptance:
  - "Every package that holds a `skills/` folder lists it in its `files`, so its skills are published. `plugins/commit-policy` did not (`skills-are-published.spec.ts`)."

### S2 — No skill is left in the documentation
- **Status**: pending
- **Files**: `packages/core/skills/shell-status/SKILL.md`, `packages/core/skills/shell-fallback/SKILL.md`, `packages/core/skills/manifest.json`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "`shell-status` and `shell-fallback` live in `packages/core/skills` and in the manifest, not in `docs/delendai/skills`, which is not published. `docs/` holds only the pointer to where skills live."

### S3 — An installed CLI reaches every configured plugin
- **Status**: pending
- **Files**: `packages/cli/package.json`, `bun.lock`, `packages/cli/src/lib/init/init-plugins-are-installed.spec.ts`
- **Gate**: type
- acceptance:
  - "A project that installs the published CLI resolves every plugin `init` writes in its configuration. Proved on packed tarballs in a throwaway project, not from the monorepo's sources, whose resolution hides the gap: the server activates each plugin, and each host folder holds its skills."

## acceptance

- Every package that holds a `skills/` folder lists it in its `files`, so its skills are published. `plugins/commit-policy` did not (`skills-are-published.spec.ts`).
- `shell-status` and `shell-fallback` live in `packages/core/skills` and in the manifest, not in `docs/delendai/skills`, which is not published. `docs/` holds only the pointer to where skills live.
- A project that installs the published CLI resolves every plugin `init` writes in its configuration. Proved on packed tarballs in a throwaway project, not from the monorepo's sources, whose resolution hides the gap: the server activates each plugin, and each host folder holds its skills.
