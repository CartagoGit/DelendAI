---
id: f00069
status: ready
type: proposal
track: web+ui-extension+components+design-tokens+i18n+docs
date: 2026-06-26
kind: feat
title: Tabs — true cross-fade between panels + iconography for PMs, sections and plugins
related:
    - f00049 # conventions unification — overlaps with `PluginTabs` consolidation (S1 here deletes it; keep the rename in lockstep)
    - f00055 # web pages review — the home page re-layout feeds this proposal
    - f00059 # i18n thread across the web/extension surface — S3 adds an `icon` field to `IHomeAtAGlanceTranslations.panels`
    - f00060 # webview host CSS into component / tokens — S2 touches `_view-transitions.scss`
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run lint,                      expect: exit0 }
    - { command: bun run lint:web,                  expect: exit0 }
    - { command: bun run lint:scss,                 expect: exit0 }
    - { command: bun run check:i18n,                expect: exit0 }
    - { command: bun run check:i18n:plugins,        expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
---

# f00069 — Tabs: true cross-fade between panels + iconography for PMs, sections, plugins

## goal

Two visible home/UI improvements, shipped as one small feature proposal:

1. **Cross-fade between tab panels.** Today `apps/web/src/components/ui/Tabs.astro`
   does a *fade-in* of the new panel only; the old one disappears with
   `display: none` (no fade-out). The user reads it as a flicker, not a
   transition. Replace with a real cross-fade: old fades out as new
   fades in, both visible for ~220 ms, layout reserves the panel height
   so nothing jumps. Same behaviour for the duplicated
   `PluginTabs.astro` controller — which this proposal also **folds**
   into `Tabs.astro` (the duplicate will be deleted; `PluginPage.astro`
   moves to `variant="plugin"`).
2. **Icons everywhere a tab or section identifies itself.** Today the
   PM tabs say `npm` / `pnpm` / `yarn` / `bun` / `deno` in plain text,
   the at-a-glance section tabs say `Plugins` / `Tools` / `Benchmarks`
   … also in plain text, even though `apps/web/public/logos/` already
   ships the brand mark for each PM (5/5), each plugin (16/16), each
   IDE (5/5) and the GitHub/Node/TypeScript set. Hook the existing
   `apps/web/src/lib/brand-logos.ts` resolver up to `<Tabs>` (new
   `icon?` prop), wire it in `HomeQuickInstallSection`, `Install`,
   `HomeAtAGlanceSection`, and tighten the `PluginDisclosure` icon
   fallback (initial letter instead of raw slug).

The two changes are independent in code but ship together because
they share the same set of touch-files (Tabs + Home) and the same
*design intent* (the home page must read like a curated product, not
a build log).

## why

Concrete user observations from this turn (2026-06-26):

- **PM tabs feel like a build log.** The home section "Instalación
  rápida" shows `npm` `pnpm` `yarn` `bun` `deno` as plain text. A
  first-time visitor doesn't know if those are package managers,
  shells, or commands. The brand logos sit unused one folder away.
- **At-a-glance tabs feel like a sitemap.** Same problem, same fix:
  the section labels (`Plugins`, `Tools`, `Benchmarks`…) would read
  ten times better with a small icon next to the label.
- **Tab switches feel snappy but jumpy.** The current
  *fade-in-only* effect makes the old panel vanish before the new
  one starts. With cross-fade, the transition reads as a single
  fluid motion — closer to the rest of the site's
  `view-transition` aesthetic on page navigation.
- **`PluginTabs` is a near-duplicate of `Tabs`** with its own
  controller. Two sources of truth → twice the bugs (the current
  `PluginTabs` doesn't even fade at all, just toggle `hidden`).
  Consolidating now is cheap; doing it after each component gains
  features is not.

## scope

In scope:

- `apps/web/src/components/ui/Tabs.astro`
- `apps/web/src/components/ui/_tabs-controller.ts`
- `apps/web/src/components/PluginTabs.astro` (deletion)
- `apps/web/src/components/PluginPage.astro`
- `apps/web/src/components/HomeQuickInstallSection.astro`
- `apps/web/src/components/HomeAtAGlanceSection.astro`
- `apps/web/src/components/Install.astro`
- `apps/web/src/components/PluginDisclosure.astro`
- `apps/web/src/components/PluginCapabilities.astro` (icon column consistency)
- `apps/web/src/i18n/shared.ts` (add `icon?` to `IHomeAtAGlanceTranslations.panels`)
- `apps/web/src/i18n/langs/*.ts` (12 languages — gate is 12-lang strict)
- `apps/web/src/styles/components/_tabs.scss` (new — extracted from Tabs.astro for reuse)
- `apps/web/src/styles/_view-transitions.scss` (no change; cross-fade does not use View Transitions API)
- `docs/mcp-vertex/skills/tabs-component/SKILL.md` (new — playbook for future consumers)

Out of scope:

- Generating new section icons. We re-use the existing `plugin-*.svg`
  brand marks for sections (one per section, picked by the i18n
  author). If the team later wants a dedicated monochrome
  `section-*.svg` set, file a separate proposal.
- Adding icons to `ConceptSection.astro` (the 4-feature grid). The
  user did not ask for it; we keep the blast radius small.
- Animation of the at-a-glance tab *panel* icons (currently they are
  static). Defer.

## slices

Five file-disjoint slices, each claimable by a single
`implementation_runner`. The global gate is `bun run validate`; the
slice-level gate is per-slice (see below).

### S1 · Cross-fade in `<Tabs>` + merge `PluginTabs`

- **Owner:** `implementation_runner`
- **Files (claim):**
  - `apps/web/src/components/ui/Tabs.astro`
  - `apps/web/src/components/ui/_tabs-controller.ts`
  - `apps/web/src/components/PluginTabs.astro` (delete)
  - `apps/web/src/components/PluginPage.astro` (consume `Tabs` with `variant="plugin"`)
  - `apps/web/tests/ui/tabs-cross-fade.spec.ts` (new — covers the cross-fade and the variant merge)
- **Gate:** `bun run test apps/web/tests/ui/tabs-cross-fade.spec.ts` + visual smoke in `bun run preview`.
- **Acceptance:**
  - `Tabs.astro` accepts a new `variant: 'underline' | 'pill' | 'plugin'`; the existing two variants keep their visual identity; `plugin` reproduces the look of the deleted `PluginTabs.astro` (rounded tab border-bottom + 0.5rem 0.9rem padding + 600-weight active label).
  - On tab change, the controller adds `.is-leaving` to the previous panel and `.is-entering` to the new one; both run for 220 ms (`cubic-bezier(0.2, 0.7, 0.2, 1)`); `aria-selected` + roving tabindex unchanged.
  - `prefers-reduced-motion: reduce` short-circuits the animation (panels toggle instantly, no flicker — verified by the spec).
  - `PluginTabs.astro` is deleted; `PluginPage.astro` compiles and renders the same look.
  - `_tabs-controller.ts` keeps its existing public surface (`initTabs`, `bindOne`) so other consumers (`FirstFiveMinutesSection`, `Install`, `HomeQuickInstallSection`, `HomeAtAGlanceSection`) need no edit.

### S2 · Extract tabs CSS into a component partial

- **Owner:** `implementation_runner`
- **Files (claim):**
  - `apps/web/src/styles/components/_tabs.scss` (new)
  - `apps/web/src/styles/styles.scss` (register the new partial)
  - `apps/web/src/components/ui/Tabs.astro` (drop the inline `<style>`; import the new partial via Astro's `is:global` if needed)
- **Gate:** `bun run lint:scss` + `bun run lint:web`.
- **Acceptance:**
  - All `.ui-tabs__*` selectors live in `_tabs.scss`. The component's `<style>` block shrinks to ≤ 5 lines (or is gone entirely).
  - The cross-fade `@keyframes` (`ui-tab-fade-in` + `ui-tab-fade-out`) and the `.is-leaving` / `.is-entering` rules land here, not in a `<style>` block inside the component.
  - No visual regression on `/install`, `/first-5-minutes`, `/`, or any `/plugins/<slug>` page.

### S3 · Tab `icon?` prop + wire PM logos into `HomeQuickInstallSection`

- **Owner:** `implementation_runner`
- **Files (claim):**
  - `apps/web/src/components/ui/Tabs.astro` (extend `Props.tabs[]` with `icon?: string`; render `<img class="ui-tabs__icon">` when present)
  - `apps/web/src/components/HomeQuickInstallSection.astro` (pass `icon: brandLogo(pm.id, 'pm')` for each of the 5 PMs)
  - `apps/web/src/components/Install.astro` (same, on the PM row)
  - `apps/web/src/lib/brand-logos.ts` (no public-API change; ensure the `pm` lookup works for `bun`/`deno` — both already ship SVG)
  - `apps/web/src/styles/components/_tabs.scss` (icon size: 18 px square, `flex: 0 0 auto`)
- **Gate:** `bun run typecheck` + visual smoke at `/` and `/install`.
- **Acceptance:**
  - `Tabs` renders an `<img class="ui-tabs__icon" width="18" height="18" alt="" loading="lazy">` before the label when `tabs[i].icon` is truthy; nothing renders when it isn't.
  - On `/`, the "Instalación rápida" row shows: 🟥 npm · 🟧 pnpm · 🟪 yarn · 🟫 bun · ⚫ deno (their actual brand marks).
  - On `/install`, the "Package manager" row shows the same 5 icons.
  - Fallback for missing logos: a 1-letter placeholder (`n`, `p`, `y`, `b`, `d`) in the same slot — implemented as `onerror` on the `<img>` (same pattern as `PluginDisclosure.astro`).

### S4 · Section icons in `HomeAtAGlanceSection` + 12-lang i18n

- **Owner:** `implementation_runner`
- **Files (claim):**
  - `apps/web/src/i18n/shared.ts` (add `readonly icon?: string` to `IHomeAtAGlanceTranslations.panels[number]`)
  - `apps/web/src/i18n/langs/en.ts` … `apps/web/src/i18n/langs/vi.ts` (12 files: add `icon: '/logos/…'` to each `panels[i]`)
  - `apps/web/src/components/HomeAtAGlanceSection.astro` (forward `p.icon` to `<Tabs tabs={…}>`)
- **Gate:** `bun run check:i18n` (12 langs × 29 keys minimum; the gate auto-fails on missing/stale keys).
- **Acceptance:**
  - All 12 language files declare `icon: '/logos/…'` for every panel (7 panels × 12 langs = 84 new lines, mechanical).
  - `bun apps/web/scripts/check-i18n.ts` exits 0.
  - On `/`, the "What can it do?" row shows: 📦 Plugins · 🔧 Tools · 📊 Benchmarks · 📚 Skills · 📖 Knowledge · 🎛 Presets · 🛠 Cross-project setup — each with the icon chosen by the i18n author.
  - Icons re-use existing files in `apps/web/public/logos/` (no new assets).

### S5 · Tighter `PluginDisclosure` icon fallback + author a SKILL

- **Owner:** `implementation_runner`
- **Files (claim):**
  - `apps/web/src/components/PluginDisclosure.astro` (replace slug-text fallback with **first letter** in a circular badge; ensure `loading="lazy"` + `decoding="async"`)
  - `apps/web/src/components/PluginCapabilities.astro` (same icon treatment if it differs)
  - `docs/mcp-vertex/skills/tabs-component/SKILL.md` (new — explains the `Tabs` API, the `icon?` prop, the cross-fade contract, the variant differences, and the rule "do not duplicate the controller — import `Tabs` instead")
- **Gate:** `bun run lint:skills` + `bun run typecheck`.
- **Acceptance:**
  - When `/logos/plugin-<slug>.svg` 404s (e.g. for a not-yet-shipped plugin), the user sees a coloured circular badge with the first letter of the slug (`P` for `proposals`, `M` for `memory`, …) instead of the raw slug text.
  - `SKILL.md` exists under `docs/mcp-vertex/skills/tabs-component/`, references both `Tabs.astro` and `brand-logos.ts`, and is included by the build's skill index.
  - `bun run lint:skills` exits 0 (the gate that verifies every skill is referenced + complete).

## out-of-scope deferrals (filed for later)

- **Custom monochrome `section-*.svg` set.** If the team prefers neutral pictograms over brand logos for sections (`Plugins`, `Tools`, `Benchmarks`, …), that's a 6-asset SVG job + a proposal of its own. The current proposal re-uses `plugin-*.svg` brand marks so we ship today.
- **`ConceptSection` icons.** The 4-feature grid stays text-only; user did not ask.
- **Animated panel icons.** The icons remain static during the cross-fade; motion stays on the panel container only. Defer.

## coordination

- **f00049** is in flight; if its `PluginTabs` consolidation happens first, S1 here is a no-op (just verify the merged version still has the cross-fade — and if not, port it). The `related:` link flags this.
- **f00059** owns the i18n surface broadly. S4 here adds one optional field (`icon?`) to a single interface (`IHomeAtAGlanceTranslations.panels[]`); no schema churn. The `related:` link flags it so the f00059 owner sees the change.
- **f00060** moves CSS into component tokens. S2 here moves tabs CSS into a `components/` partial — same direction, not in conflict.

## acceptance (end-to-end)

After all five slices close:

- `bun run validate` exits 0.
- `/` shows the "Quick install" row with five brand-mark PMs and the "What can it do?" row with seven section icons.
- Switching tabs on any `<Tabs>` (home, install, first-5-minutes, plugin pages) animates with the new cross-fade — verified by a recorded interaction (out of scope for automation; review manually).
- `apps/web/src/components/PluginTabs.astro` no longer exists; `PluginPage.astro` uses `<Tabs variant="plugin">`.
- `docs/mcp-vertex/skills/tabs-component/SKILL.md` documents the API.