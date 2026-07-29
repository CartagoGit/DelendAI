---
id: x00188
title: "a00083 — i18n completion pass: guide.astro, vscode webview schema, ui-extension aria-labels"
kind: fix
status: ready
type: proposal
track: apps+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
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
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `extensions/vscode/src/commands/open-agent-catalog.ts#L131`.
- Define a `MESSAGE_SCHEMA = z.discriminatedUnion('command', [...])` covering every currently-handled `command` (`refresh`, `copied`, etc.).
- Replace the duck-typed dispatch with `MESSAGE_SCHEMA.safeParse(message)`; on failure, return a structured `[mcp-vertex] dropped invalid webview message` log and ignore.
- **Acceptance**: `bun test extensions/vscode/src/test/...` (or the closest equivalent) — new spec fires an unknown `command` and asserts the host ignored it.

### S2 — guide.astro i18n
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **Files**: `apps/web/src/pages/guide.astro`, `apps/web/src/i18n/ui.ts`.
- Audit the page; every visible string + accessible attribute moves to `ui.ts` (12 locales). Use the existing `t(key, locale)` helper.
- **Acceptance**: `bun run site:strict` exits 0 after the change.

## Notes



- a00083 — full-project audit
- a2f3fa73 — shipped F22 + F23 (the throw-on-missing-label pattern in `packages/ui-extension`)

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
