---
id: x00979
title: "Every web locale and route is generated from one source and gated strictly"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00979 — Every web locale and route is generated from one source and gated strictly

## goal

Locale switchers and links resolve to pages the build emits, every satellite namespace is under the translation gate, the strict build runs the checker strictly, tutorial parity compares slugs, tool descriptions come from one source, and the extension dictionaries are validated before the English fallback hides gaps.

## why

Joint audit a00095 and gpt-6.1-sol. G8: web and ui-extension i18n is incomplete; 10 languages silently fall back to English. D11: the main matrix is perfect; 7 satellite namespaces have no gate. G22: each tool description exists twice (web i18n repeats the registered text). G134: every language switcher points at non-existent routes (/delendai/ar/delendai/plugins/: the base is doubled). G135: API doc links come out with a double slash and point at a page the build does not generate. sol WEB-ROUTE01: localised home pages link to preset pages never emitted. sol WEB-TUTORIAL01: tutorial parity accepts equal counts with different slugs. sol WEB-GATE01: the strict web build calls the checker in warn-only mode. sol UI-I18N01: the strict extension gate checks fallback dictionaries and misses 180 absent keys in each of 10 locales. sol WEB-SKILL01: the skills index renders a literal "undefined" heading.

## non-goals

- Publishing the site (the web-publish proposal).

## slices

- global_gate: type

### S1 — Routes and links resolve
- **Status**: pending
- **Files**: `apps/web/src/components/Config.astro`, `apps/web/src/components/HomeAtAGlanceSection.astro`, `apps/web/src/pages/presets.astro`, `apps/web/src/pages/[lang]/cli.astro`
- **Gate**: type
- acceptance:
  - "A built-site crawl finds no internal 404 from language switchers, preset links or API links (G134, G135, WEB-ROUTE01)."

### S2 — Strict gates over every namespace
- **Status**: pending
- **Files**: `apps/web/scripts/check-i18n.ts`, `apps/web/scripts/check-tutorials-i18n.ts`, `apps/web/package.json`, `apps/web/src/i18n/extend.ts`, `extensions/vscode/scripts/check-i18n.ts`, `apps/shared/src/i18n/index.ts`
- **Gate**: type
- acceptance:
  - "The strict build fails on a missing key in any namespace, satellites included (D11, WEB-GATE01, G8)."
  - "Tutorial parity compares slugs (WEB-TUTORIAL01)."
  - "The extension gate checks raw dictionaries before fallback (UI-I18N01)."

### S3 — One source for tool descriptions, and the skills index
- **Status**: pending
- **Files**: `apps/web/scripts/gen-skills.ts`, `apps/web/src/components/SkillsSection.astro`, `apps/web/src/components/CapabilityGrid.astro`
- **Gate**: type
- acceptance:
  - "English tool descriptions are generated from the registrations; only translations are authored (G22)."
  - "No skill renders under an undefined namespace (WEB-SKILL01)."

## acceptance

- A built-site crawl finds no internal 404 from language switchers, preset links or API links (G134, G135, WEB-ROUTE01).
- The strict build fails on a missing key in any namespace, satellites included (D11, WEB-GATE01, G8).
- Tutorial parity compares slugs (WEB-TUTORIAL01).
- The extension gate checks raw dictionaries before fallback (UI-I18N01).
- English tool descriptions are generated from the registrations; only translations are authored (G22).
- No skill renders under an undefined namespace (WEB-SKILL01).
