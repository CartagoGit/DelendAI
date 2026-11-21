---
id: f00099
kind: feat
status: done
type: proposal
track: web+extensions/vscode+lint
date: 2026-07-07
title: "Style integrity — fix unstyled classes and add a markup↔scss ratchet (web + extension)"
shipped-in: []
recan: []
related:
    - f00098 # cli-ui-parity ratchet — the same "declarative contract + lint" pattern applied to styles
    - c00002 # npm publish gate — user requires 100% visual perfection before publishing
ownership:
    - { agent: implementation_runner, task: 'S1: style or prune every used-but-undefined class in apps/web' }
    - { agent: implementation_runner, task: 'S2: lint:style-integrity ratchet (nesting-aware markup↔scss cross-check)' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run site, expect: exit0 }
---

# f00099 — Style integrity: fix unstyled classes + markup↔scss ratchet (web + extension)

## goal

Eliminate the class of "page renders unstyled" breakage the user reported
("muchos scss están rotos tanto en web como en la extensión") and make it
structurally impossible to regress: fix every real used-but-undefined class
in `apps/web`, then ship a nesting-aware lint that cross-checks the classes
used in `.astro` markup against the selectors defined in scss (global +
shared + component-local `<style>` blocks), with documented waivers for
intentional bare BEM namespace hooks.

## why

Two real breakages already landed and shipped invisible to every gate:
`_markdown-page.scss` was never `@use`'d (every generated markdown page
unstyled since f00055) and the tool-detail webview linked its CSS with a
relative href that never loads in a VS Code webview (fixed 3d8ee957). A
sweep (nesting-aware, `&__child` expanded) found ~19 more files using
classes with no definition anywhere — whole components (`Tutorial`,
`LogTable`, `RecoveryTable`, `plugin-install`) render bare. `lint:scss`
(stylelint) can never catch this: it lints scss files in isolation and says
nothing about markup that references missing selectors. The repo's proven
answer to cross-surface drift is a declarative ratchet (lint:cli-coverage,
lint:cli-ui-parity); styles deserve the same. This is an npm-publish
blocker per the user's 2026-07-07 direction.

## non-goals

- **No visual redesign.** S1 styles what exists to match sibling
  components; it does not restyle working pages.
- **No CSS-in-JS or tooling migration.** The scss architecture stays.
- **No extension scss framework.** The extension keeps inline `<style>`
  blocks in renderers (CSP posture); its integrity check is that every
  class a renderer emits appears in its own inline style block.

## Slices

- global_gate: validate

### S1 — Style or prune every used-but-undefined class (apps/web)

- **Status**: pending
- **Files**: `apps/web/src/styles/components/*.scss`, `apps/web/src/components/**/*.astro`, `apps/web/src/pages/**/*.astro`
- **Gate**: bun run site
- **Acceptance**:
  - "Every class flagged by the nesting-aware sweep is triaged: real gaps get styles consistent with sibling components (Tutorial, LogTable, RecoveryTable, plugin-install, config__copy/config__snippet, args, install-eco__packager, drawer__logo, nav__github-icon, plugin-disc__empty, ui-callout__body, ui-code__copy-text, ui-copybtn__label, ui-tabs__label, locale-picker, muted, btn--small); dead hooks are removed from markup; intentional bare BEM bases are recorded for the S2 waivers file."
  - "Real `bun run site` build green; spot-check the affected routes render styled (tutorials, /logs recovery tables, plugin pages)."
- status: done
### S2 — lint:style-integrity ratchet

- **Status**: pending
- **Files**: `tools/scripts/lint/style-integrity.script.ts`, `tools/scripts/lint/style-integrity.waivers.json`, `tools/scripts/lint/style-integrity.script.spec.ts`
- **Depends on**: S1
- **Gate**: bun run lint:proposals
- **Acceptance**:
  - "Script expands scss nesting (`&__x`/`&--x` under parent context) across apps/web + apps/shared styles plus component-local `<style>` blocks, extracts `class=\"…\"` literals from .astro markup (dynamic expressions skipped), and fails on used-but-undefined classes not covered by a documented waiver."
  - "Waivers need a reason (bare BEM namespace hooks, third-party classes like pagefind/markdown-body); repo passes with the initial waivers file."
  - "Wired into `bun run validate` after lint:scss; spec covers nesting expansion, waiver honouring, and a failing fixture."
- status: done
## acceptance

- `bun run validate` → exit 0 (including the new lint:style-integrity once
  S2 lands).
- `bun run site` → exit 0.
- No `.astro` markup references a class with zero styling anywhere unless
  it carries a documented waiver.
