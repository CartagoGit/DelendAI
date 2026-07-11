---
id: f00103
kind: feat
status: ready
type: proposal
track: shared+ui-extension+web+extensions/vscode+dev+lint
date: 2026-07-08
title: "Rename mv-* prefix to mcpv-* across the shared UI + fix dev-mode styles/i18n"
shipped-in: []
recan: []
related:
    - f00102 # shared-ui source of truth — defined the mv-* namespace this renames
    - f00099 # style-integrity ratchet — its mv-* built-in ignore updates to mcpv-*
    - c00002 # npm publish gate — brand-consistent prefix + working dev preview are release polish
ownership:
    - { agent: implementation_runner, task: 'S1: fix dev-mode preview so styles + i18n always apply' }
    - { agent: implementation_runner, task: 'S2: rename mv-* -> mcpv-* codemod across all surfaces + ratchets' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run site, expect: exit0 }
    - { command: bun run build, expect: exit0 }
---

# f00103 — Rename mv-* → mcpv-* + fix dev-mode styles/i18n

## goal

Two user-reported polish items for the npm-perfection bar: (1) the dev
preview (`bun run dev:*`) renders the extension webviews **unstyled and
without applying the selected language** — styles and translations must
always apply; (2) the shared-UI namespace prefix is `mv-` / `--mv-` /
`data-mv-` / `__MV_` / `mv:`, but the project brand is **mcpv** — every
prefix should read `mcpv` for a consistent public surface.

## why

**Dev-mode breakage.** `renderDashboard` (and the other webview renderers)
return a COMPLETE `<html>` document whose CSS lives in two `<style>` blocks
in the `<head>`. The dev entries (`packages/ui-extension/src/dev/entry.ts`,
`extensions/vscode/src/dev/entry.ts`) inject only the extracted `<body>`
into `#root`, discarding the `<head>` — so every dev preview renders
unstyled. The ui-extension entry additionally hard-coded `lang:
dictsByLang.en`, so language selection never took effect. VS Code's real
webview renders the whole document, so production is fine; the dev harness
is the broken surface, and it is the one the maintainer looks at daily.

**Prefix.** `mv-` is an unbranded, ambiguous two-letter namespace (collides
mentally with "move", video `mv`, etc.). The project is `mcpv`; the CSS
custom properties, BEM classes, data-attributes, the `__MV_HOST__` global,
the `mv:`-prefixed storage/event keys, and the `shared-ui-ratchet` that
enforces the namespace should all read `mcpv`. This is a mechanical rename
but it crosses apps/shared + packages/ui-extension + apps/web +
extensions/vscode + the dev harness + two lint ratchets, so it needs to
land as one coherent codemod with full build+validate+site verification
(the f00102 build breakage proved root `validate` does NOT run `bun run
build`/`bun run site`).

## non-goals

- **No visual change.** The rename is namespace-only; every rule keeps its
  declarations. The dev-mode fix restores the intended styling, it does not
  restyle anything.
- **No token-value changes.** `--mv-bg` becomes `--mcpv-bg` with the same
  value; the palette is untouched.
- **No API rename beyond the prefix.** Function names (`renderDashboard`,
  `renderRuntime`) stay; only the `mv`/`MV` string namespace changes.

## Slices

- global_gate: validate

### S1 — Fix dev-mode preview so styles + i18n always apply

- **Status**: pending
- **Files**: `packages/ui-extension/src/dev/entry.ts`, `extensions/vscode/src/dev/entry.ts`, `tools/scripts/dev/dev.script.ts`
- **Gate**: bun run build
- **Acceptance**:
  - "Every dev entry hoists the rendered document's `<head>` `<style>` blocks into the live page head (idempotently, so a re-render on language change replaces rather than duplicates) instead of discarding them; the ui-extension entry resolves the preview language from `?lang=` (default en) so translations apply and are switchable."
  - "`bun run dev:ide` / `dev:vscode` visibly render the dashboard + webviews styled, in the selected language; a spot-check of the built dev bundle confirms the `<style>` blocks reach the page. (ui-extension entry already fixed in this branch — verify + extend to the vscode entry + any shared harness seam.)"

### S2 — Rename mv-* → mcpv-* codemod across all surfaces + ratchets

- **Status**: pending
- **Files**: `apps/shared/src/**`, `packages/ui-extension/src/**`, `apps/web/src/**`, `extensions/vscode/src/**`, `tools/scripts/dev/**`, `tools/scripts/lint/shared-ui-ratchet.script.ts`, `tools/scripts/lint/shared-ui-ratchet.waivers.json`, `tools/scripts/lint/style-integrity.script.ts`
- **Depends on**: S1
- **Gate**: bun run validate
- **Acceptance**:
  - "Scripted rename of every namespaced token, boundary-safe: CSS custom props `--mv-` → `--mcpv-`; BEM classes `mv-<x>` → `mcpv-<x>` (in scss selectors, .ts/.astro `class=` strings, and `@extend`); `data-mv-` → `data-mcpv-`; the `__MV_HOST__` global → `__MCPV_HOST__`; storage/event keys `mv:` → `mcpv:` (mv:lang, mv:dev:*). No stray `mv-` token remains (a grep gate in the ratchet asserts zero)."
  - "`shared-ui-ratchet` (its hardcoded token list + its scanner regex) and `style-integrity`'s built-in `mv-*` ignore both switch to `mcpv-*`; the waivers files update; both ratchets pass."
  - "`bun run validate` + `bun run build` + `bun run site` all green; the dev preview still renders (S1) with the new prefix."

## acceptance

- `bun run validate` → exit 0.
- `bun run build` → exit 0 (dts + bundles).
- `bun run site` → exit 0 (real static build).
- `grep -r "mv-\|--mv-\|data-mv-\|__MV_\|'mv:" apps packages extensions tools`
  (scoped to the UI namespace) returns zero hits outside historical
  proposal docs.
- Dev preview renders styled + translated in the selected language.
