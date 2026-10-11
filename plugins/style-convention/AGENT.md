# AGENT.md — plugin `plugins/style-convention`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- The style surface: who may define a selector, what a change to it reaches, and whether a hard-coded value already has a design token.

## Public API

- extractDefinedClasses
- extractUsedClasses
- parseAstro
- splitSelectorList
- globToRegExp
- styleOptionsSchema
- checkStyle
- designTokensOf
- buildSelectorGraph
- impactOfFile
- impactOfSelector
- packageOf
- architectureFor
- directiveSupported

## Depends on

- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/style-convention/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/style-convention/tests/src/lib/check/style-check.service.spec.ts
- plugins/style-convention/tests/src/lib/graph/selector-graph.service.spec.ts
- plugins/style-convention/tests/src/lib/profile/style-profile.service.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

