---
id: x00514
title: "Brand display polish: delendai- prefix on skills, DelendAI title on tools, brand-voice identity strings"
kind: fix
status: in-progress
type: proposal
track: brand-display
date: 2026-09-07
last-transition-id: x00514-start-2026-09-07
last-correlation-id: x00514-delendai-orchestrator
last-transition-from: ready
last-idempotency-key: x00514-start-1
---

# x00514 — Brand display polish: delendai- prefix on skills, DelendAI title on tools, brand-voice identity strings

## Goal

Bring the user-facing MCP surface and the skill catalog into the brand voice of DelendAI without breaking wire format. Three sibling slices: a one-time skill-id prefix audit, a one-time addition of `title:` to every `registerTool` call site, and a one-time capitalisation of the user-visible identity strings in server/knowledge/logs.

## why

Today, nine skill ids leak without the `delendai-` prefix
(`read-stderr-storm`, `tabs-component`, `error-collection`,
`debugging-playbook`, `incident-response`, `migrate-from-x`,
`performance-optimization`, `pr-review-checklist`,
`security-hardening-checklist`). The existing lint spec
(`tools/scripts/lint/host-instructions.script.spec.ts`) already asserts the
prefixed form `delendai-tabs-component`, so the canonical shape is
unambiguous. Meanwhile every `server.registerTool` call in
`packages/core/src/lib/tools/*` and `plugins/*/src/lib/tools/*` registers
without a `title` field — even though `@modelcontextprotocol/sdk@1.30` accepts
`title?: string`, so the LLM only sees snake_case identifiers. The MCP
`serverInfo` and knowledge titles still leak lowercase identities where the
brand capitalisation should land. None of these touch wire format; all are
zero-risk uplift of the surfaces a human or model reads first.

## why this design

Capitalising the brand text in user-facing places is a single-channel
clarification, not a rebrand. b00239 already owns the CLI/bin/scopes-level
identity (wire-stable). This proposal owns only the **display** layer above
the wire layer:

1. **Skill ids** — the catalog id is the human/agent-readable key used in
   prose, lint output, and host-instructions. Renaming has no wire impact
   because nothing in MCP speaks skills; it only changes the string we
   render and what the lint spec asserts.
2. **Tool `title:`** — MCP already routes `title` and `description`
   independently. Adding `title` is purely additive at the protocol level;
   it does not change what the host calls (`name` is unchanged), what the
   schemas are (`inputSchema`/`outputSchema` are unchanged), or what
   `tools/list` is keyed by (`name` is unchanged).
3. **Identity strings** — `serverInfo.title`, knowledge titles, boot
   banner — are user-facing brand voice. Capitalising them is a one-line
   edit per file with no functional change.

## non-goals

- Do not rename npm scopes, cli bin names, MCP tool ids, or `plugin.*` ids
  (those are wire-stable; b00239 already locked them).
- Do not rewrite the prose of tool/skill descriptions beyond the brand-voice
  capsule in S3 (descriptions stay functionally identical — no
  description-text edits in S1/S2 at all).
- Do not change the proposal nomenclatura or proposal filename shape.

## architecture

```text
display layer (this proposal)
  ┌───────────────┬─────────────────────┬──────────────────┐
  │ skill ids     │ tool titles         │ identity strings │
  │ delendai-*    │ "DelendAI <Verb>"   │ "DelendAI …"     │
  ├───────────────┼─────────────────────┼──────────────────┤
  │ catalog.ts    │ registerTool.title  │ serverInfo.title │
  │ manifest.json │                     │ knowledge titles │
  │ SKILL.md      │                     │ boot banner      │
  └───────────────┴─────────────────────┴──────────────────┘
                  │
                  ▼
wire layer (b00239 / unchanged)
  cli bin, npm scopes, MCP tool ids, plugin ids, knowledge ids
```

## Slices

- global_gate: lint

### S1 — Skill prefix audit
- **Status**: pending
- **Files**: `packages/core/skills/error-collection/SKILL.md`, `packages/core/skills/tabs-component/SKILL.md`, `packages/core/skills/manifest.json`, `plugins/commit-policy/skills/read-stderr-storm/SKILL.md`, `plugins/skills-pack/skills/debugging-playbook/SKILL.md`, `plugins/skills-pack/skills/incident-response/SKILL.md`, `plugins/skills-pack/skills/migrate-from-x/SKILL.md`, `plugins/skills-pack/skills/performance-optimization/SKILL.md`, `plugins/skills-pack/skills/pr-review-checklist/SKILL.md`, `plugins/skills-pack/skills/security-hardening-checklist/SKILL.md`, `plugins/skills-pack/src/skills/catalog.ts`, `plugins/skills-pack/src/index.ts`, `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`, `docs/delendai/agent-catalog.generated.json`, `tools/scripts/lint/host-instructions.script.spec.ts`, `tools/scripts/lint/file-conventions.baseline.json`, `tools/scripts/lint/host-instructions.script.ts`
- **Gate**: lint
- acceptance:
  - "All 9 skill ids start with `delendai-` in their SKILL.md frontmatter."
  - "`manifest.json`, `catalog.ts`, `managed-lazy-catalog.generated.ts`, and `agent-catalog.generated.json` reflect the prefixed ids without double-prefixing."
  - "`tools/scripts/lint/host-instructions.script.ts` passes its own spec without expanding the expected set (the spec already encodes the canonical form)."
  - "`tools/scripts/lint/file-conventions.baseline.json` resolves every listed path; no orphans introduced."
  - "`bun run validate` (lint + type + unit tests) exits 0 with zero new failures."

### S2 — Tool display titles
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/tools/overview-tool.ts`, `packages/core/src/lib/tools/agent-catalog-tool.ts`, `packages/core/src/lib/tools/cache-reconcile.tool.ts`, `packages/core/src/lib/tools/compact-router.tool.ts`, `packages/core/src/lib/tools/configuration-center.tool.ts`, `packages/core/src/lib/tools/knowledge-tool.ts`, `packages/core/src/lib/tools/resolve-capability.tool.ts`, `packages/core/src/lib/plugins/router.ts`, `packages/core/src/lib/bootstrap/init-config-tool.ts`, `packages/core/src/lib/bootstrap/plan-tool.ts`, `packages/core/src/lib/bootstrap/create-tool.ts`, `packages/core/src/lib/bootstrap/drift-check-tool.ts`, `packages/core/src/lib/bootstrap/analyze-tool.ts`, `packages/core/src/lib/metrics/metrics-tool.ts`, `packages/core/src/lib/registry/plugin-add.tool.ts`, `packages/core/src/lib/registry/plugin-search.tool.ts`, `packages/core/src/lib/scaffold/scaffold-tool.ts`, `packages/core/src/lib/scaffold/extract-plugin.ts`, `packages/core/src/lib/scaffold/create-plugin.tool.ts`, `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/shared/fs-tools.ts`, `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/src/lib/project/create-mcp-project.ts`
- **Gate**: type
- acceptance:
  - "Every `registerTool` site has a non-empty `title` string of shape `DelendAI <Verb Phrase>`."
  - "`bunx tsc --noEmit -p tsconfig.json` exits 0."
  - "No title contains a period, hyphen-to-space, or trailing colon."
  - "Focused vitest run covers at least the bootstrap tool set; no regression in existing tool-surface specs."

### S3 — Brand-voice identity strings
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/tools/knowledge-tool.ts`, `packages/core/src/lib/shared/boot-banner.ts`, `packages/core/src/lib/logs/logger.ts`, `packages/core/src/public/index.ts`
- **Gate**: lint
- acceptance:
  - "MCP initialize response `serverInfo.title` capitalises DelendAI."
  - "Knowledge catalogue titles start with `DelendAI`."
  - "No tool/skill description text is touched in this slice (S1 and S2 already cover all brand-voice text outside these identity strings)."
  - "`bunx tsc --noEmit -p tsconfig.json` exits 0."

## dependency graph

S1 is the foundation: it corrects the catalog and lint fixtures first, so S2
and S3 can rely on consistent skill ids in any prose or assertion they
reference.

S2 has minimal coupling with S1 (only that S2's titles reference sibling
catalog names via prose), but splits out as a separate slice to keep each
commit/file set tight and reviewable.

S3 depends on S1 and S2 because the identity strings used in
`serverInfo`/`knowledge` titles reference the catalog and tool surfaces — if
those are still in flight, S3 would be re-touching files. The dependency
keeps the diff chain honest.

## acceptance

- All 9 skill ids start with `delendai-` in their SKILL.md frontmatter.
- `manifest.json`, `catalog.ts`, `managed-lazy-catalog.generated.ts`, and
  `agent-catalog.generated.json` reflect the prefixed ids without
  double-prefixing.
- `tools/scripts/lint/host-instructions.script.ts` passes its own spec
  without expanding the expected set.
- `tools/scripts/lint/file-conventions.baseline.json` resolves every listed
  path; no orphans introduced.
- `bun run validate` (lint + type + unit tests) exits 0 with zero new
  failures.
- Every `registerTool` site has a non-empty `title` string of shape
  `DelendAI <Verb Phrase>`.
- `bunx tsc --noEmit -p tsconfig.json` exits 0.
- No tool/skill description text is touched in S3.
- MCP initialize response `serverInfo.title` capitalises DelendAI.
- Knowledge catalogue titles start with `DelendAI`.

## risks and mitigations

- **Risk**: lint baselines pick up the rename and fail unexpectedly.
  Mitigation: S1 explicitly lists `file-conventions.baseline.json` and
  `host-instructions.script.ts` in scope so the rename keeps the baseline
  honest.
- **Risk**: a future proposal references an old skill id (e.g.
  `tabs-component`) without the prefix and creates a dead reference.
  Mitigation: an integration test in S1 asserts every catalog id resolves
  to an existing SKILL.md frontmatter id; adding a new skill bypasses it.
- **Risk**: `title:` field clashes with custom rendering in any host (e.g.
  a host that only shows `name`).
  Mitigation: MCP `title` is purely additive — hosts that ignore it see no
  change. Hosts that read it (Cursor, Claude Code, etc.) already render it.
- **Risk**: S2 touches many files; a parallel agent could collide.
  Mitigation: S2's slice is claimed through `agent_lock` before any edit,
  and the workflow emits a peer-review round.

## notes

This proposal is the display-layer companion of `b00239` (rebrand). Where
b00239 owns wire-stable identity (CLI bin, npm scopes, tool/plugin ids),
this proposal owns everything **above** the wire layer: human-readable
names. They are intentionally separate so a future protocol-stability
guarantee can pin the wire layer without any commitment to brand voice, and
so a future brand voice change can drift independently of the wire layer.
