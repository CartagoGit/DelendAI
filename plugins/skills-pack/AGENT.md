# AGENT.md — plugin `plugins/skills-pack`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Curated skill pack (debugging, perf, pr-review, security, incident, migration).

## Public API

- DEBUGGING_PLAYBOOK_SKILL
- INCIDENT_RESPONSE_SKILL
- MIGRATE_FROM_X_SKILL
- PERFORMANCE_OPTIMIZATION_SKILL
- PR_REVIEW_CHECKLIST_SKILL
- SECURITY_HARDENING_CHECKLIST_SKILL
- SKILLS_PACK_SKILLS
- default

## Depends on

- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/skills-pack/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/skills-pack/src/skills/skills.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

