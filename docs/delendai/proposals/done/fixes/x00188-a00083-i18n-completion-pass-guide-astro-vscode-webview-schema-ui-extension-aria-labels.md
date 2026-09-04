---
id: x00188
title: "a00083 — i18n completion pass: guide.astro, vscode webview schema, ui-extension aria-labels"
kind: fix
status: done
type: proposal
track: apps+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
shipped-in:
    - 53927ed5 # fix(x00188): vscode agent-catalog webview schema + guide.astro dict drift
---

# x00188 — a00083 — i18n completion pass: guide.astro, vscode webview schema, ui-extension aria-labels

## Goal

Resolve findings F21, F24 (and the residual i18n coverage) from a00083 (29-07-2026). The easy/medium slice (`a2f3fa73`) already shipped F22 + F23 (the `closeLabel` / `ariaLabel` throw-on-missing pattern in `packages/ui-extension`); this proposal covers the remaining i18n + vscode webview surfaces:

- **F21** `extensions/vscode/src/commands/open-agent-catalog.ts#L131` — the webview uses duck-typed dispatch on `command` / `id`. Add a Zod-validated message schema and a single `safeParse` gate.
- **F24** `apps/web/src/pages/guide.astro#L50` — the *primary guide page* ships visible English copy outside the i18n system. Move every visible string to `src/i18n/ui.ts` and resolve it through `t()`.

(F22 and F23 were easy; shipped in `a2f3fa73`.)

## why

- **F21 (vscode webview)** — a compromised webview panel can probe host-side commands without any contract check. The rest of the extension uses `safeParse` already (configuration center); this one path is the outlier.
- **F24 (guide.astro)** — `apps/web` scored **6.9 / 10** in the audit, the lowest of the apps layer. i18n completeness was 4/10. The guide is the highest-traffic page; English-only copy silently degrades every non-English locale's first impression.

## non-goals

- Rewriting `apps/web/src/i18n/ui.ts`. The proposal only adds the missing keys and replaces inline English in `guide.astro`.
- Adding new translation strings. The fix reuses the existing 12-locale dictionary; English copy stays as the source string.

## slices

### S1 — vscode agent-catalog webview schema
- **Status**: done
- **Files**: `extensions/vscode/src/contracts/constants/agent-catalog-message-schema.constant.ts` (new), `extensions/vscode/src/commands/open-agent-catalog.ts`, `extensions/vscode/src/test/open-agent-catalog.spec.ts` (new)
- **Gate**: test
- acceptance:
  - "F21 reproduced exactly as described: dispatch keyed off `(message as {command?:unknown}).command`/`.id` with zero contract check."
  - "Added `AGENT_CATALOG_MESSAGE_SCHEMA = z.discriminatedUnion('command', [...])` (5 variants: refresh, copied, callTool/openSkill/openProposal each requiring `id: z.string().min(1)`), mirroring `CONFIGURATION_CENTER_MESSAGE_SCHEMA`'s exact pattern (the proposal's own cited precedent)."
  - "Dispatch now runs `AGENT_CATALOG_MESSAGE_SCHEMA.safeParse(raw)` first; on failure, logs `[mcp-vertex] dropped invalid webview message` (console.warn, matching the existing console.error precedent in vscode-host-adapter.ts) with the zod issues, and returns without touching any host state."
  - "New spec (this plugin's open-agent-catalog.ts had zero test coverage before) drives the real `registerOpenAgentCatalogCommand` through a faked panel/vscode API (reusing the createSnapshot/panel-faking patterns from the sibling agent-catalog.spec.ts and configuration-center.spec.ts): proves an unrecognised command and a `callTool` with an empty `id` are both dropped with a warning and zero side effects (no tool call, no cache invalidation, no info message), then proves a valid `copied` message still works afterward."
  - "`bun test extensions/vscode` → 224 pass / 1 pre-existing unrelated fail (`dev-settings-lifecycle.spec.ts`, `vi.stubGlobal is not a function` — a Bun-test-runner API gap in a file this proposal never touched) / 1 new file, 1 new test."

### S2 — guide.astro i18n
- **Status**: done
- **Files**: `apps/web/src/pages/guide.astro`
- **Gate**: test
- acceptance:
  - "Investigated before touching anything: `apps/web/src/pages/[lang]/guide.astro` (the actual localized route for the other 11 languages) already sources `title`/`description`/the 13-entry TOC from `t.guide.*` in `en.ts`, and already renders an explicit, visible '⚠ This guide is in English. Translations for {langCode} are pending' notice for every non-English reader. This is a deliberate, already-shipped, DISCLOSED design — not a silent degradation as F24 claims. The section BODY (13 sections, ~450 lines of technical prose) is intentionally English-only on both the root and `[lang]` routes; `apps/web/scripts/scan-jsx-literals.ts` (the actual enforcement gate) only scans `src/pages/[lang]/**/*.astro`'s `<PageHeader>`/`<Base>` title attributes — it was never scoped to catch page-body prose, on this page or any other."
  - "The real, narrow, safely-scoped gap: the ROOT `guide.astro` (canonical `/guide`, English) hardcoded its OWN second copy of `title`/`description`/the 13 TOC strings instead of sourcing them from the same `guide.*` dict entry its `[lang]` sibling already uses — two sources of truth for identical content, silent-drift risk if one is edited without the other."
  - "Fixed: root `guide.astro` now calls `useTranslations('en')` and uses `t.guide.title` (also for the `<h1>`), `t.guide.description`, and `t.guide.toc[0..12]` — removing the duplicated hardcoded strings. The body's English-only status is unchanged (matches the sibling route's own documented, disclosed design) and explicitly left out of scope: fully translating ~450 lines of prose into 12 languages is a content-authoring effort, not a wiring fix."
  - "Verified: `bun run typecheck` clean; a real `astro build` (2657 pages) renders `<title>Guide — @mcp-vertex/core</title>` and `<h1>Guide</h1>` correctly from the dict; `bun run check:i18n` (12 languages × 304 keys) and `bun run lint:web:jsx-literals` both still pass; `cd apps/web && bun run build:strict` exits 0."

## Notes



- a00083 — full-project audit
- a2f3fa73 — shipped F22 + F23 (the throw-on-missing-label pattern in `packages/ui-extension`)

## acceptance

Both slices land with their acceptance bullets green. S1: `bun test extensions/vscode` clean except one pre-existing, unrelated failure. S2: `bun run typecheck`, `check:i18n`, `lint:web:jsx-literals`, and `apps/web`'s `build:strict` all exit 0; a real `astro build` confirms the dict-sourced title/h1 render correctly.
