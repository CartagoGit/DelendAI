# AGENT.md — plugin `plugins/changelog`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Conventional-commits changelog + release plan generator.

## Public API

- parseConventionalCommit
- type IConventionalCommit
- type CommitType
- groupByType
- type IChangelogSection
- renderMarkdown
- inferBump
- buildReleasePlan
- buildReleasePlanToolRegistration
- buildChangelogGenerateToolRegistration

## Depends on

- @delendai/core
- zod

## Writes

- <host workspace>/.delendai/cache/changelog/

## Entry points

- ./src/index.ts
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/changelog/src/lib/bump/infer-bump.spec.ts
- plugins/changelog/src/lib/tools/changelog-generate.tool.spec.ts
- plugins/changelog/src/lib/tools/release-plan.tool.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

