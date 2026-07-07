---
id: f00101
kind: feat
status: ready
type: proposal
track: ui-extension+client+docs+web
date: 2026-07-07
title: "Cross-IDE extension author toolkit — published contract, scaffold, and porting guide"
shipped-in: []
recan: []
related:
    - f00097 # proposals board — proved the host-agnostic builder / thin adapter split works
    - f00098 # provider dashboard — second proof; IHostAdapter is the seed contract
    - f00089 # author-plugin scaffold — the plugin-side precedent this mirrors for extensions
    - c00002 # npm publish gate — ecosystem story is part of the release bar
ownership:
    - { agent: implementation_runner, task: 'S1: EXTENSION-AUTHORING guide — contract + wire protocol, language-agnostic' }
    - { agent: implementation_runner, task: 'S2: create_project kind extension-host scaffold (TS reference)' }
    - { agent: implementation_runner, task: 'S3: web /extend page + PAGES_AUDIT' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run site, expect: exit0 }
---

# f00101 — Cross-IDE extension author toolkit: contract + scaffold + guide

## goal

Let third parties build mcp-vertex extensions for IDEs and languages the
maintainer will never touch ("yo uso vscode… no voy a implementarlo en
todos los lenguajes, pero sí dar herramientas"): publish the host-adapter
contract as a documented, versioned surface; ship a `create_project`
scaffold that generates a working TS extension-host skeleton against it;
and document the wire level (MCP stdio + JSON render-models) so a
JetBrains/Kotlin or Neovim/Lua author can port WITHOUT the TS packages.

## why

The architecture already earned this: `packages/ui-extension` is
host-agnostic by construction (IHostAdapter + pure HTML/render-model
builders), proven twice (f00097 board, f00098 dashboard), and every data
payload is plain JSON over MCP stdio — nothing about the vscode host is
essential. What is missing is the ECOSYSTEM surface: the contract lives in
an internal interface file nobody outside the repo can find, there is no
scaffold, and no docs page says "here is how you build a host". The
author-plugin scaffold (f00089 U4) proved the pattern for plugins; this is
the same move for extension hosts.

## non-goals

- **No non-TS reference implementations.** The toolkit documents the wire
  contract so others can write Kotlin/Lua/Python hosts; we ship only the
  TS reference (the maintainer works in TS).
- **No marketplace/publishing automation for third parties.**
- **No new render-model surfaces** — the toolkit exposes what exists.

## Slices

- global_gate: validate

### S1 — EXTENSION-AUTHORING guide (contract + wire protocol)

- **Status**: pending
- **Files**: `docs/mcp-vertex/EXTENSION-AUTHORING.md`
- **Gate**: bun run lint:proposals
- **Acceptance**:
  - "Documents the two authoring tiers: (A) TS host — implement IHostAdapter (every member annotated: required vs optional capability), reuse @mcp-vertex/ui-extension builders + @mcp-vertex/client services; (B) any language — speak MCP over stdio to the server, call the same tools (overview, agent_catalog, proposals_*, healthcheck_providers, usage_report…), render the documented JSON payloads; includes the CSP posture, i18n expectations (12-lang table pattern), and the cli-ui-parity duty (map your commands or waive them)."
  - "States the compatibility promise: IHostAdapter + tool output schemas are the versioned contract (generated tool-outputs.ts / outputSchema as source of truth); breaking changes follow toolSchemaVersion."

### S2 — create_project kind 'extension-host' scaffold (TS reference)

- **Status**: pending
- **Files**: `packages/core/src/lib/scaffold/scaffold-extension-host.ts`, `packages/core/src/lib/bootstrap/create-tool.ts`, `packages/core/src/lib/bootstrap/schemas.ts`, `packages/core/tests/src/lib/scaffold/scaffold-extension-host.spec.ts`
- **Depends on**: S1
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "`create_project { kind: 'extension-host' }` returns a compiling skeleton: minimal IHostAdapter impl with TODO seams (registerCommand/createWebviewPanel/showInformationMessage required; the rest stubbed optional), one wired example command (overview → webview via renderJsonHtml-style helper), package.json + tsconfig + vitest + a passing example spec — same file-shape conventions as scaffoldPluginFiles."
  - "Scaffold output referenced from the S1 guide; catalog/tool-outputs regenerated for the schema change."

### S3 — Web /extend page

- **Status**: pending
- **Files**: `apps/web/src/pages/extend.astro`, `apps/web/src/i18n/extend.ts`, `apps/web/src/data/pages-audit.ts`
- **Depends on**: S1
- **Gate**: bun run lint:web
- **Acceptance**:
  - "Static page presenting the two tiers with the scaffold quickstart and a link to the guide; standalone byLang i18n map (en source, es translated, rest fallback); registered in PAGES_AUDIT; `bun run site` green."

## acceptance

- `bun run validate` → exit 0.
- `bun run site` → exit 0.
- A third-party author can go from zero to a compiling TS host skeleton
  with one tool call, or port to another language from the wire docs alone.
