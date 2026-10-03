---
id: x00200
title: "Codex CLI custom-subagent format + `existingMcpVertex` flag for non-invasive host scaffolding"
kind: fix
status: done
type: proposal
track: scaffold+init+codex+claude-code+self-hosting+adopter-experience+postman-exporter
date: 2026-08-01
---

# x00200 — Codex CLI custom-subagent format + `existingMcpVertex` flag for non-invasive host scaffolding

## Goal

Three concrete gaps the **postman-exporter project** hit when attempting to use
mcp-vertex via `mcpv init` and `create_project { kind: "host" }`:

1. The scaffolder never emitted **Codex CLI custom-subagent** files
   (`.codex/agents/*.md`). AGENT-BOOTSTRAP.md §8.3 told Codex sessions how to
   invoke the orchestrator; nothing ever created the subagent that section
   refers to — even mcp-vertex's own dev repo (dogfooding the same gap x00160
   closed for Claude Code).
2. `create_project { kind: "host" }` overwrote a project's working
   `mcp-vertex.config.json` + `plugins/` setup with a self-contained
   `libs/mcp-project/` server bootstrap that conflicted with it. Projects
   that mount mcp-vertex as a **tooling guest** had no clean way to re-run
   the scaffolder without disturbing their wiring.
3. The init flow (`mcpv init`, `mcpv init:default`) mirrored Copilot and Claude
   subagents but was missing the Codex variant for parity.

Fix all three so a host adopting mcp-vertex in any of those three modes gets a
correct, non-destructive bootstrap.

## Why

User-reported in a continuous session hand-off (the postman-exporter repo),
2026-08-01, after explicitly running `create_project { kind: "host" }` against
a project that already used mcp-vertex as a guest via `mcp-vertex.config.json` +
`plugins/`. Two concrete failure modes observed live:

- (1) The scaffolder emitted `libs/mcp-project/src/server.ts` etc. and a
  `.vscode/mcp.json` that pointed at `bun --watch run src/index.ts` from
  `libs/mcp-project/` — replacing the user's working `mcp.json` that pointed at
  the host mcp-vertex server. The kept-legacy mode preserved the old
  `.vscode/mcp.json` as `legacy/` but the project had two parallel MCP server
  registrations at runtime.
- (2) `AGENT-BOOTSTRAP.md` §8.3 (Codex CLI host appendix) already references the
  orchestrator subagent. No scaffolder path emits the file; Codex adopters
  never see it. Mirrors the x00160 Claude Code gap, which closed when the
  Claude format was added end-to-end.

## Slices

### S1 — `scaffoldCodexAgentFile` plus 5-fold emission in `scaffoldHostProject`
- **Status**: done
- **Implementation**: added `scaffoldCodexAgentFile(options, slot)` in
  `packages/core/src/lib/scaffold/scaffold-host.ts` — kebab-case `name` +
  single-line `description`, no `tools:` or `model:` fields. Contract mirrors
  the Claude Code file because Codex CLI's documented custom-agent format
  matches it; an invented per-host tool vocabulary would trade one inaccuracy
  for another. `scaffoldHostProject` now emits both: 5 Copilot +
  5 Claude + 5 Codex agents in the default order.
- **Exported**: `packages/core/src/public/index.ts` adds `scaffoldCodexAgentFile`.
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`,
  `packages/core/src/public/index.ts`,
  `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts` (new tests).
- **Tests**: `bun test packages/core/tests/src/lib/scaffold` — 26/26 pass
  (added 4: Codex agent shape, scaffold emits 5+5+5, existingMcpVertex skips
  libs/, default still emits libs/).

### S2 — `existingMcpVertex: true` skips `libs/mcp-project/` bootstrap
- **Status**: done
- **Implementation**: added `existingMcpVertex?: boolean` to
  `IScaffoldHostOptions` (with a doc paragraph explaining the two modes).
  When `true`, `scaffoldHostProject` skips `host-config.ts`, `server.ts`,
  `index.ts`, and `.vscode/mcp.json` — those files would otherwise overwrite
  the working `mcp-vertex.config.json` + `plugins/` layout. Agents,
  instructions, and starter skill are still emitted in both modes.
  Wired through `SCAFFOLD_INPUT_SCHEMA.existingMcpVertex` so the
  `<prefix>_scaffold` MCP tool exposes the flag.
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`,
  `packages/core/src/lib/scaffold/scaffold-tool.ts` (input schema + wiring).
- **Use the flag for**: projects that mount mcp-vertex as a tooling guest
  (server named `mcp-vertex`, plugins in `plugins/`, host server entry
  external). Do **not** use it for greenfield — let the scaffolder generate
  the self-contained `libs/mcp-project/` so `bun run src/index.ts` Just Works.

### S3 — Init flow parity: `renderCodexAgentFile` in `mcpv init`
- **Status**: done
- **Implementation**: added `renderCodexAgentFile` to
  `packages/cli/src/lib/init/init-render.service.ts`, parallel to
  `renderClaudeAgentFile` (x00160). `renderAgentFiles` now emits a Copilot
  file + a Claude file + a Codex file per role. The optional
  `generateAgentMd: false` answer now skips all three formats (test
  refreshed).
- **Files**: `packages/cli/src/lib/init/init-render.service.ts`,
  `packages/cli/src/lib/init/init-render.service.spec.ts`.
- **Tests**: `bun test packages/cli/src/lib/init` — 32/32 pass
  (added 1: `generateAgentMd=false` skips Copilot + Claude + Codex files).

### S4 — Docs
- **Status**: done
- `EXTENSION-AUTHORING.md` — added a section on `create_project { kind: "host" }`
  with explicit guidance on when to set `existingMcpVertex: true`.
- `FILE-CONVENTIONS.md` — new "Editor host subagent files" table;
  host files are explicitly **exempt** from the role-suffix rule because
  the editors (Copilot Chat, Claude Code, Codex CLI) — not the repo —
  dictate the paths and frontmatter keys.
- `AGENT-BOOTSTRAP.md` — new §8.3 "Codex CLI — custom subagents + workspace
  `AGENTS.md`"; renumbered Cursor/Aider/Continue to §8.4; TOC updated to
  include §8.3.

## Acceptance

- [x] `scaffoldCodexAgentFile` is exported from `@mcp-vertex/core/public` and
      matches Codex CLI's documented custom-agent format (kebab-case `name`,
      `description`, no `tools:` or `model:` field required).
- [x] `scaffoldHostProject` emits 5 Copilot + 5 Claude + 5 Codex files by
      default; tests pin this contract.
- [x] `existingMcpVertex: true` skips the four files that conflict with a
      project that already wires mcp-vertex via its own config +
      plugins; agents / instructions / skill still emitted.
- [x] `existingMcpVertex: false` (default) still emits
      `libs/mcp-project/{server.ts,index.ts,lib/shared/host-config.ts}`
      and `.vscode/mcp.json` — greenfield projects still get a working
      bootstrap.
- [x] `<prefix>_scaffold` MCP tool accepts the new `existingMcpVertex` field.
- [x] `mcpv init` and `init:default` render Codex subagent files alongside
      Copilot and Claude; `generateAgentMd: false` skips all three formats.
- [x] AGENT-BOOTSTRAP.md §8.3 added; TOC + cross-references updated.
- [x] FILE-CONVENTIONS.md documents the three host file paths and frontmatter
      contracts explicitly (and exempts them from the role-suffix rule).
- [x] All tests green: 1175 core + 437 CLI + 1007 plugins + the new
      scaffold + init tests = 0 fail, 0 regressions.
- [x] Typecheck: `bunx tsc --noEmit -p packages/{core,cli}/tsconfig.json` clean.

## Non-goals

- **No automatic detection of "this project already uses mcp-vertex"**. The
  scaffolder cannot sniff it from the scaffolder tool itself; the caller must
  pass `existingMcpVertex: true` explicitly. Auto-detection would couple the
  tool to filesystem heuristics that change across editor / shell configurations
  and would silently change a future greenfield project's output.
- **No per-plugin bounded agents** (e.g. `postman_exporter_builder`).
  Generating plugin-specific agents is a larger semantic move: the scaffolder
  would need to inspect `mcp-vertex.config.json → plugins` and emit one
  orchestrator per plugin. Out of scope here; file as a follow-up
  if postman-exporter keeps hitting it.
- **No namespace ↔ host-server-name reconciliation**. The scaffolder still
  assumes `namespacePrefix === MCP server name`. Postman-exporter uses
  `postman-exporter` namespace but the host server is named `mcp-vertex`,
  so the tool names in agent bodies are wrong (`postman-exporter_overview`
  vs the real `mcp-vertex_overview`). This is a **pre-existing** limitation
  that affects the Copilot and Claude variants equally — fixing it requires
  the scaffolder to know which MCP server wires which plugin set. Tracked as
  a separate scope item, not part of this feat.
- **No `.codex/agents/` discovery for legacy projects**. Existing adopters
  who ran `mcpv init` before this commit must re-run the scaffolder to get the
  Codex files. The scaffolder's `keepLegacy: true` mode preserves the prior
  agents and the new format is added alongside — re-running is safe.

## Verification log

```
$ bun test packages/core/tests/src/lib/scaffold
 26 pass  0 fail

$ bun test packages/cli/src/lib/init
 32 pass  0 fail

$ bun test packages/core
1175 pass  0 fail

$ bun test packages/cli
 437 pass  0 fail

$ bun test plugins
1007 pass  0 fail

$ bunx tsc --noEmit -p packages/{core,cli}/tsconfig.json
(no output — clean)
```

End-to-end dry-run (output trimmed):

```
$ bun -e '...scaffoldHostProject({existingMcpVertex: true})'
17 files:
  .github/agents/{orchestrator,proposal_guardian,implementation_runner,
                   delivery_verifier,technical_investigator}.agent.md
  .claude/agents/{orchestrator,proposal-guardian,implementation-runner,
                  delivery-verifier,technical-investigator}.md
  .codex/agents/{orchestrator,proposal-guardian,implementation-runner,
                 delivery-verifier,technical-investigator}.md
  .github/copilot-instructions.md
  libs/mcp-project/src/lib/skills/<namespace>-project-standards.md
```

(labs/mcp-project/src/server.ts etc. **omitted** when
`existingMcpVertex: true` — the right behaviour for a project that already
mounts mcp-vertex via `mcp-vertex.config.json` + `plugins/`.)
