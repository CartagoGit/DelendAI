# AGENT.md — plugin `plugins/browser`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Headless browser automation tools.

## Public API

- probePlaywright
- PLAYWRIGHT_INSTALL_HINT
- buildBrowserInspectToolRegistrations
- buildBrowserVerifyPageToolRegistrations
- buildBrowserA11yToolRegistrations
- mapAxeReport
- summarizeSeverity
- outcomeToFinding
- outcomesToFindings

## Depends on

- @delendai/core
- zod
- playwright

## Writes

- <host workspace>/.delendai/cache/browser/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/browser/src/lib/page/browser-page.tool.spec.ts
- plugins/browser/src/lib/page/playwright-probe.spec.ts
- plugins/browser/src/lib/tools/browser-a11y.tool.spec.ts
- plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

