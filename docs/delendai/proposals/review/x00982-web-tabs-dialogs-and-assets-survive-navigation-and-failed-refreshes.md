---
id: x00982
title: "Web tabs, dialogs and assets survive navigation and failed refreshes"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: dfd4f1bd-6a5a-4e81-8af0-1ed7365387b5
last-correlation-id: dfd4f1bd-6a5a-4e81-8af0-1ed7365387b5
last-transition-from: in-progress
last-transition-at: 2026-11-03T05:01:54.171Z
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
- **Status**: review
- **Files**: `apps/web/src/components/ui/_tabs-controller.ts`, `apps/web/src/components/ui/Tabs.astro`, `apps/web/src/components/ui/CopyButton.astro`, `apps/web/src/components/ui/CodeBlock.astro`, `apps/web/src/components/Config.astro`, `apps/web/src/components/ui/_focus-trap.ts`, `apps/web/src/components/ui/_focus-trap.spec.ts`, `apps/web/src/components/ui/_tabs-controller.spec.ts`
- **Gate**: type
- acceptance:
  - "Controllers rebind on astro:page-load and cancel stale fade callbacks (WEB-TABS01, WEB-TABS02)."
  - "The settings dialog moves focus in and traps it (WEB-A11Y01)."
- shipped-in: `d0e829dafe93`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Nav styles and brand assets
- **Status**: review
- **Files**: `apps/web/src/components/SiteNav.astro`, `apps/web/src/styles/components/_nav.scss`, `apps/web/src/styles/components/_nav-media.scss`, `apps/web/scripts/fetch-brand-logos.ts`, `apps/web/scripts/lib/brand-logo-files.ts`, `apps/web/scripts/lib/brand-logo-refresh.ts`, `apps/web/scripts/__tests__/brand-logo-files.spec.ts`
- **Gate**: type
- acceptance:
  - "The More dropdown classes are styled (WEB-CSS01)."
  - "A fetch writes to a temp file and replaces the cached logo only when the response is SVG (WEB-ASSET01, WEB-ASSET02)."
- shipped-in: `14985863ee4f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Controllers rebind on astro:page-load and cancel stale fade callbacks (WEB-TABS01, WEB-TABS02).
- The settings dialog moves focus in and traps it (WEB-A11Y01).
- The More dropdown classes are styled (WEB-CSS01).
- A fetch writes to a temp file and replaces the cached logo only when the response is SVG (WEB-ASSET01, WEB-ASSET02).
