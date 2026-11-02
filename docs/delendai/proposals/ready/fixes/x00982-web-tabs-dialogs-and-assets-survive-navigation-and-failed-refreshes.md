---
id: x00982
title: "Web tabs, dialogs and assets survive navigation and failed refreshes"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00982 — Web tabs, dialogs and assets survive navigation and failed refreshes

## goal

Tabs and copy buttons keep working after client navigation and fades, the settings dialog takes focus, the More menu is styled, and a failed or HTML brand-logo fetch keeps the cached logo.

## why

gpt-6.1-sol's contribution to a00095, confirmed in a real Chrome: WEB-TABS01 an old fade callback hides the tab panel that became active again; WEB-TABS02 tabs and copy buttons stop binding after an Astro client navigation; WEB-A11Y01 opening settings by keyboard leaves focus behind the modal; WEB-CSS01 the More dropdown uses a class prefix the stylesheet never styles; WEB-ASSET01 a failed brand refresh deletes the cached logo; WEB-ASSET02 HTML gateway responses are written as SVG logos.

## non-goals

- Routes and translations (web-i18n).

## slices

- global_gate: type

### S1 — Tabs, copy and focus
- **Status**: pending
- **Files**: `apps/web/src/components/ui/_tabs-controller.ts`, `apps/web/src/components/ui/Tabs.astro`, `apps/web/src/components/ui/CopyButton.astro`, `apps/web/src/components/ui/CodeBlock.astro`, `apps/web/src/components/Config.astro`
- **Gate**: type
- acceptance:
  - "Controllers rebind on astro:page-load and cancel stale fade callbacks (WEB-TABS01, WEB-TABS02)."
  - "The settings dialog moves focus in and traps it (WEB-A11Y01)."

### S2 — Nav styles and brand assets
- **Status**: pending
- **Files**: `apps/web/src/components/SiteNav.astro`, `apps/web/src/styles/components/_nav.scss`, `apps/web/src/styles/components/_nav-media.scss`, `apps/web/scripts/fetch-brand-logos.ts`
- **Gate**: type
- acceptance:
  - "The More dropdown classes are styled (WEB-CSS01)."
  - "A fetch writes to a temp file and replaces the cached logo only when the response is SVG (WEB-ASSET01, WEB-ASSET02)."

## acceptance

- Controllers rebind on astro:page-load and cancel stale fade callbacks (WEB-TABS01, WEB-TABS02).
- The settings dialog moves focus in and traps it (WEB-A11Y01).
- The More dropdown classes are styled (WEB-CSS01).
- A fetch writes to a temp file and replaces the cached logo only when the response is SVG (WEB-ASSET01, WEB-ASSET02).
