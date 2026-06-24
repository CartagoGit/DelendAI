---
id: f00056
status: ready
type: proposal
track: host+extension+skills+docs
date: 2026-06-25
kind: feat
title: Agent discovery catalog - derive tools, skills and proposals once, surface them across hosts, and bootstrap downstream workspaces without prompt drift
shipped-in: []
recan: []
related:
  - f00041 # mcp.json parity for the configured plugin surface
  - f00020 # skills manifest is already the canonical skill index
ownership:
  - { agent: implementation_runner, task: 'S1: build the canonical agent-discovery catalog, expose it as tool/resource/prompt, and add the token-budget regression gate' }
  - { agent: implementation_runner, task: 'S2: extend the skill-manifest contract with compact summaries or deterministic fallback extraction, generate the checked-in artifact, and add stale-catalog guards' }
  - { agent: implementation_runner, task: 'S3: wire the catalog into the VS Code extension and shared client services so tools, skills, and proposals are discoverable from one entrypoint' }
  - { agent: implementation_runner, task: 'S4: generate host hint fragments for Copilot, Claude Code, Cursor, and generic AGENTS consumers from the same catalog builder' }
  - { agent: implementation_runner, task: 'S5: ship downstream bootstrap through packaged prompts/resources, scaffolded host hints, and worked examples in minimal and swarm' }
globalGate: validate
acceptance:
  - { command: bun run types:generate, expect: exit0 }
  - { command: bun run test, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# f00056 - Agent discovery catalog - derive tools, skills and proposals once, surface them across hosts, and bootstrap downstream workspaces without prompt drift

## Goal

Make mcp-vertex publish one canonical, regenerable discovery surface for agents so that any host connected to the server can cheaply learn three things without rereading 17 SKILL bodies or hand-maintained docs:

1. which tools are loaded and which plugin owns them,
2. which skills exist and when each one should be used,
3. which proposals are actionable right now.

The same source of truth must drive the MCP tool/resource/prompt surface, the VS Code extension discovery UI, and the host-specific hint files used by Copilot Chat, Claude Code, Cursor, and downstream consumers of @mcp-vertex/core.

## why

- `mcp-vertex_overview { compact: true }` already proves that a low-token cold start is possible, but it is not the single canonical catalog for skills plus proposals plus host bootstrap hints.
- `skills/manifest.json` is already the authoritative versioned skill index, yet agents still need to open individual SKILL files to learn the one-line routing hints that should be cheap.
- `docs/proposals/index.json` is the canonical proposal registry, but today no compact server-side discovery surface exposes the actionable subset to hosts and agents in the same way tools are exposed.
- The VS Code extension has views and QuickPick flows for tools and knowledge, but not one unified discovery surface that also carries skills and proposals or a chat-facing slash entrypoint.
- Downstream projects that install mcp-vertex should inherit the same discovery contract automatically from the server itself; host files are a compatibility layer, not the primary source of truth.

## non-goals

- Forking or duplicating full SKILL.md bodies into a second catalog file.
- Creating a new repo-root directory or a host-specific copy of the catalog.
- Guaranteeing that every third-party client renders native slash or at-suggestion UI identically; when a host lacks that UI, the fallback is the same MCP prompt/resource plus generated hint fragment.
- Replacing `mcp-vertex_overview`; the new catalog complements it by covering skills, actionable proposals, and host bootstrap hints from the same builder.
- Shipping the full historical proposal archive in the compact default payload; the compact path carries actionable proposals plus counts, while full and paginated modes can expose the whole index.

## Slices

### S1 - Canonical agent-discovery builder + MCP surface
- **Files**: packages/core/src/lib/catalog/agent-discovery-catalog.ts, packages/core/src/lib/tools/agent-catalog-tool.ts, packages/core/src/lib/resources/agent-catalog-resource.ts, packages/core/src/lib/prompts/agent-bootstrap.prompt.ts, packages/core/src/public/index.ts, packages/core/tests/src/lib/e2e/agent-catalog.e2e.spec.ts, packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - "One pure builder derives the loaded tool catalog from the live plugin registry, the skill catalog from skills/manifest.json, and the proposal catalog from docs/proposals/index.json; no host keeps a second hand-maintained list of tools, skills, or proposal ids."
  - "The server exposes that builder through one public tool with outputSchema, one read-only MCP resource, and one bootstrap prompt; all three are generated from the same data model and stay byte-for-byte consistent in tests."
  - "The compact default payload stays within a measured ceiling of 1 300 bytes on the fixture workspace, which mirrors roughly 325 tokens; the regression test fails if the budget or the compact-vs-full saving is broken."
  - "The compact mode returns actionable proposals plus per-status counts, while full or paginated mode can enumerate the complete proposal registry without changing the compact budget contract."

### S2 - Skill summary contract + checked-in generated artifact + drift guards
- **Files**: skills/manifest.json, tools/scripts/catalog/generate-agent-catalog.script.ts, tools/scripts/catalog/generate-agent-catalog.spec.ts, docs/mcp-vertex/agent-catalog.generated.json, lefthook.yml
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - "Each skill contributes one compact summary through skills/manifest.json; if a summary is absent, the generator deterministically falls back to the first paragraph of the SKILL body and emits a lint failure so the repo converges back to explicit summaries."
  - "A checked-in generated artifact is produced from exactly three inputs - live tool registry, skills/manifest.json, and docs/proposals/index.json - and the generator is idempotent: rerunning it without input changes produces a byte-identical file."
  - "A focused test and a pre-commit hook fail when the generated catalog, the skill manifest, the live registry, or the proposal index drift apart."
  - "No SKILL body is copied wholesale into the artifact; only the compact summary, version, tags, and bodyPath metadata are surfaced."

### S3 - VS Code extension and shared client integration
- **Files**: packages/client/src/lib/services/agent-catalog-service.ts, extensions/vscode/package.json, extensions/vscode/src/commands/tool-search.ts, extensions/vscode/src/commands/open-agent-catalog.ts, extensions/vscode/src/providers/tool-tree-data-provider.ts, extensions/vscode/src/views/agent-catalog-webview.ts, extensions/vscode/src/test/agent-catalog.spec.ts, extensions/vscode/src/test/tool-search.spec.ts
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - "The VS Code extension adds one first-class discovery entrypoint backed by AgentCatalogService and resolves tools, skills, and actionable proposals from the same MCP catalog surface instead of keeping separate hard-coded arrays."
  - "Typing a tool name, skill id, tag, proposal id, or proposal title into the extension search surface returns the canonical match from the unified catalog."
  - "If the host supports MCP prompts or chat slash surfaces, the extension exposes the bootstrap prompt there; if not, the fallback command still opens the same catalog and inserts or copies the canonical starter invocation without divergent prose."
  - "The extension tests prove that the UI surface reflects the live catalog and that removing or renaming a skill/tool/proposal breaks the test instead of silently drifting."

### S4 - Generated host hints for Copilot, Claude Code, Cursor, and generic AGENTS consumers
- **Files**: tools/scripts/catalog/render-host-hints.script.ts, docs/mcp-vertex/host-hints/copilot-instructions.generated.md, docs/mcp-vertex/host-hints/claude.generated.md, docs/mcp-vertex/host-hints/agents.generated.md, .github/copilot-instructions.md, CLAUDE.md, AGENTS.md, docs/CROSS-IDE.md
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - "Copilot, Claude Code, Cursor or generic AGENTS consumers each receive a generated hint fragment derived from the same catalog builder; only host syntax differs, never the routing content."
  - "The generated fragments all agree on the canonical first move: call mcp-vertex_overview { compact: true }, then call the new catalog surface when the task needs tool, skill, or proposal routing."
  - "The human-edited instruction files keep only stable narrative and include generated discovery sections instead of duplicating catalog facts manually."
  - "A golden test proves that the generated host fragments remain consistent with the catalog artifact and fail when a skill or tool is added without the host output changing."

### S5 - Downstream bootstrap and worked examples
- **Files**: packages/cli/src/public/index.ts, packages/core/src/lib/scaffolds/host-hints.ts, docs/CROSS-PROJECT-SETUP.md, examples/minimal/README.md, examples/swarm/README.md, examples/minimal/mcp-vertex.config.json, docs/README-MCP-VERTEX.md
- **Status**: ready
- **Gate**: bun run validate
- **Acceptance**:
  - "A downstream workspace that points any MCP client at @mcp-vertex/core automatically receives the same discovery tool, resource, and bootstrap prompt with no manual host-file copy required."
  - "For hosts that still rely on checked-in instructions, one scaffold path writes Copilot, Claude, and AGENTS-compatible hint files from the generated artifact; the examples/minimal and examples/swarm directories are the golden outputs."
  - "The cross-project setup docs explain one bootstrap path per host and reference the packaged generated hints instead of repo-private prose."
  - "The examples demonstrate the worked version of the contract: connect to the server, discover tools plus skills plus proposals from one place, and begin with the same low-token routing hints the repo itself uses."

## acceptance

- The repo owns exactly one builder for the tool, skill, and proposal discovery contract.
- The public catalog tool declares outputSchema and ships a measured compact budget with a regression test.
- Skills are surfaced from the manifest contract plus compact summaries, never by copying whole SKILL bodies into another source.
- The VS Code extension consumes the live MCP catalog and exposes a chat-adjacent discovery entrypoint for tools, skills, and proposals.
- Copilot, Claude Code, Cursor or generic AGENTS consumers read generated hint fragments derived from the same catalog.
- Downstream installs receive the catalog, resource, and bootstrap prompt automatically from the server, with optional generated host files for clients that still need checked-in instructions.
- bun run validate is green at the end of every slice.

## notes

### Closure plan

- packages/core/src/lib/catalog/agent-discovery-catalog.ts: canonical builder that joins live tools, skill manifest entries, and proposal index entries.
- packages/core/src/lib/tools/agent-catalog-tool.ts: cheap MCP entrypoint with outputSchema and compact/full modes.
- packages/core/src/lib/resources/agent-catalog-resource.ts: native MCP resource for clients that surface resources in their suggestion UI.
- packages/core/src/lib/prompts/agent-bootstrap.prompt.ts: host-facing bootstrap prompt so compatible clients can offer slash or prompt insertion from the same source.
- tools/scripts/catalog/generate-agent-catalog.script.ts: deterministic generator for the checked-in artifact and host fragments.
- docs/mcp-vertex/agent-catalog.generated.json: checked-in snapshot that docs, tests, and host fragments can consume without booting the server.
- skills/manifest.json: add compact per-skill summaries or enable deterministic fallback extraction without changing the existing versioned index role.
- packages/client/src/lib/services/agent-catalog-service.ts: shared client-side adapter so the extension and any future host consume one service.
- extensions/vscode/src/commands/open-agent-catalog.ts: first-class extension entrypoint for unified discovery.
- extensions/vscode/src/views/agent-catalog-webview.ts: UI surface for the merged catalog when the host does not surface prompts natively.
- .github/copilot-instructions.md, CLAUDE.md, AGENTS.md: stable host instruction files that include generated discovery fragments instead of hand-maintained catalog prose.
- docs/CROSS-IDE.md and docs/CROSS-PROJECT-SETUP.md: document the bootstrap path for repo-local and downstream installs.
- examples/minimal and examples/swarm: worked outputs proving that downstream consumers inherit the same discovery contract.

### Token budget

- Compact agent-catalog target: 1 300 bytes maximum on the fixture workspace, approximately 325 tokens.
- Full agent-catalog target: 6 800 bytes maximum on the same fixture, so the compact path remains a real saving.
- Invariant: compact must stay below full x 0.7, mirroring the existing overview budget discipline in docs/TOKEN-BUDGETS.md.
- Measurement harness: extend packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts to capture compact and full agent-catalog payloads beside overview and auto_work.
- Fallback rule: proposal archive details move to full or paginated mode; compact only carries actionable proposal ids/titles plus counts so the 1-call budget survives growth.

### Divergence guards

- Vitest generator spec: recompute the artifact from the live tool registry, skills/manifest.json, and docs/proposals/index.json and assert byte equality.
- Token-budget e2e: fail when compact or full payloads exceed their ceilings or when compact stops being materially cheaper.
- VS Code smoke spec: assert that the extension discovery entrypoint returns a live tool, a skill, and a proposal from the same catalog service.
- Golden host-hints spec: render Copilot, Claude, and AGENTS fragments and compare them against the checked-in generated outputs.
- Lefthook pre-commit step: rerun the generator and fail if git diff is non-empty.
- Types gate: bun run types:generate stays part of acceptance whenever the public tool surface changes.

### Cross-host compatibility

| Host | Native surface to target | Catalog source | Fallback when native surface is absent |
|---|---|---|---|
| Copilot Chat in VS Code | MCP prompt plus extension command or webview | agent-catalog builder via MCP tool/resource/prompt | generated fragment in .github/copilot-instructions.md plus open-agent-catalog command |
| Claude Code | MCP prompt and CLAUDE.md discovery fragment | same builder | generated CLAUDE fragment that points at overview then agent-catalog |
| Cursor | MCP prompt or AGENTS-compatible instructions | same builder | generated AGENTS fragment plus checked-in artifact |
| Generic AGENTS consumer | AGENTS.md and MCP resource discovery | same builder | generated AGENTS fragment and paginated catalog tool |

### Implementation defaults chosen here

- The compact default only includes actionable proposals plus counts by status; the full archive remains available through full or paginated mode.
- Skill summaries should live in skills/manifest.json when possible because they are cheaper and more deterministic than parsing arbitrary SKILL prose, but the generator may temporarily fall back to the first paragraph while the manifest is being backfilled.
- The automatic downstream experience is server-first: prompts, resources, and the catalog tool arrive with the installed server; checked-in host files are a compatibility scaffold, not the primary transport.