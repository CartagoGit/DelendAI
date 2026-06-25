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

## non-goals

- **Custom monochrome `section-*.svg` set.** If the team prefers neutral
  pictograms over brand logos for sections (`Plugins`, `Tools`,
  `Benchmarks`, …), that's a 6-asset SVG job + a proposal of its own.
  The current proposal re-uses `plugin-*.svg` brand marks so we ship
  today.
- **`ConceptSection` icons.** The 4-feature grid stays text-only; the
  user did not ask for it.
- **Animated panel icons.** The icons remain static during the
  cross-fade; motion stays on the panel container only.

## architecture

Touched files (file-disjoint slices below):

- `apps/web/src/components/ui/Tabs.astro` — variant union extended,
  `icon?` prop added, CSS for cross-fade.
- `apps/web/src/components/ui/_tabs-controller.ts` — `setActive`
  rewritten for cross-fade (two parallel animations, reflow guard,
  reduced-motion fallback).
- `apps/web/src/components/PluginTabs.astro` — **deleted**.
- `apps/web/src/components/PluginPage.astro` — consumes
  `<Tabs variant="plugin">`.
- `apps/web/src/components/HomeQuickInstallSection.astro` — passes
  `icon: brandLogo(pm.id, 'pm')` for each PM.
- `apps/web/src/components/HomeAtAGlanceSection.astro` — forwards
  `p.icon` to `<Tabs>`.
- `apps/web/src/components/Install.astro` — passes `icon` on the PM row.
- `apps/web/src/components/PluginDisclosure.astro` — icon fallback
  becomes first-letter badge.
- `apps/web/src/components/PluginCapabilities.astro` — icon consistency.
- `apps/web/src/lib/brand-logos.ts` — no public-API change; verifies the
  `pm` lookup works for `bun` / `deno`.
- `apps/web/src/i18n/shared.ts` — adds `icon?: string` to
  `IHomeAtAGlanceTranslations.panels[number]`.
- `apps/web/src/i18n/langs/*.ts` (12 languages) — adds `icon:` to
  each `panels[i]`.
- `apps/web/src/styles/components/_tabs.scss` — new partial extracted
  from Tabs.astro.
- `apps/web/src/styles/styles.scss` — registers the new partial.
- `apps/web/tests/ui/tabs-cross-fade.spec.ts` — new spec covering the
  cross-fade + `plugin` variant merge.
- `docs/mcp-vertex/skills/tabs-component/SKILL.md` — new SKILL
  documenting the API.

## Slices

Five file-disjoint slices, each claimable by a single
`implementation_runner`. The global gate is `bun run validate`; the
slice-level gate is per-slice (see below).

### S1 — Cross-fade in `<Tabs>` + merge `PluginTabs`

- **Status**: done
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/components/ui/Tabs.astro`, `apps/web/src/components/ui/_tabs-controller.ts`, `apps/web/src/components/PluginTabs.astro` (delete), `apps/web/src/components/PluginPage.astro`, `apps/web/tests/ui/tabs-cross-fade.spec.ts` (new)
- **Gate**: `bun run test apps/web/tests/ui/tabs-cross-fade.spec.ts`
- **Command**: `bun run test apps/web/tests/ui/tabs-cross-fade.spec.ts`
- **Expect**: exit0
- **Acceptance:**
  - `Tabs.astro` accepts a new `variant: 'underline' | 'pill' | 'plugin'`; the existing two variants keep their visual identity; `plugin` reproduces the look of the deleted `PluginTabs.astro` (rounded tab border-bottom + 0.5rem 0.9rem padding + 600-weight active label).
  - On tab change, the controller adds `.is-leaving` to the previous panel and `.is-entering` to the new one; both run for 220 ms (`cubic-bezier(0.2, 0.7, 0.2, 1)`); `aria-selected` + roving tabindex unchanged.
  - `prefers-reduced-motion: reduce` short-circuits the animation (panels toggle instantly, no flicker — verified by the spec).
  - `PluginTabs.astro` is deleted; `PluginPage.astro` compiles and renders the same look.
  - `_tabs-controller.ts` keeps its existing public surface (`initTabs`, `bindOne`) so other consumers (`FirstFiveMinutesSection`, `Install`, `HomeQuickInstallSection`, `HomeAtAGlanceSection`) need no edit.

### S2 — Extract tabs CSS into a component partial

- **Status**: pending
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/styles/components/_tabs.scss` (new), `apps/web/src/styles/styles.scss`, `apps/web/src/components/ui/Tabs.astro`
- **Gate**: `bun run lint:scss && bun run lint:web`
- **Command**: `bun run lint:scss && bun run lint:web`
- **Expect**: exit0
- **Acceptance:**
  - All `.ui-tabs__*` selectors live in `_tabs.scss`. The component's `<style>` block shrinks to ≤ 5 lines (or is gone entirely).
  - The cross-fade `@keyframes` (`ui-tab-fade-in` + `ui-tab-fade-out`) and the `.is-leaving` / `.is-entering` rules land here, not in a `<style>` block inside the component.
  - No visual regression on `/install`, `/first-5-minutes`, `/`, or any `/plugins/<slug>` page.

### S3 — Tab `icon?` prop + wire PM logos into `HomeQuickInstallSection`

- **Status**: pending
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/components/ui/Tabs.astro`, `apps/web/src/components/HomeQuickInstallSection.astro`, `apps/web/src/components/Install.astro`, `apps/web/src/lib/brand-logos.ts`, `apps/web/src/styles/components/_tabs.scss`
- **Gate**: `bun run typecheck`
- **Command**: `bun run typecheck`
- **Expect**: exit0
- **Acceptance:**
  - `Tabs` renders an `<img class="ui-tabs__icon" width="18" height="18" alt="" loading="lazy">` before the label when `tabs[i].icon` is truthy; nothing renders when it isn't.
  - On `/`, the "Instalación rápida" row shows: 🟥 npm · 🟧 pnpm · 🟪 yarn · 🟫 bun · ⚫ deno (their actual brand marks).
  - On `/install`, the "Package manager" row shows the same 5 icons.
  - Fallback for missing logos: a 1-letter placeholder (`n`, `p`, `y`, `b`, `d`) in the same slot — implemented as `onerror` on the `<img>` (same pattern as `PluginDisclosure.astro`).

### S4 — Section icons in `HomeAtAGlanceSection` + 12-lang i18n

- **Status**: pending
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/i18n/shared.ts`, `apps/web/src/i18n/langs/en.ts`, `apps/web/src/i18n/langs/es.ts`, `apps/web/src/i18n/langs/fr.ts`, `apps/web/src/i18n/langs/de.ts`, `apps/web/src/i18n/langs/it.ts`, `apps/web/src/i18n/langs/pt.ts`, `apps/web/src/i18n/langs/ar.ts`, `apps/web/src/i18n/langs/hi.ts`, `apps/web/src/i18n/langs/ja.ts`, `apps/web/src/i18n/langs/zh.ts`, `apps/web/src/i18n/langs/th.ts`, `apps/web/src/i18n/langs/vi.ts`, `apps/web/src/components/HomeAtAGlanceSection.astro`
- **Gate**: `bun run check:i18n`
- **Command**: `bun run check:i18n`
- **Expect**: exit0
- **Acceptance:**
  - All 12 language files declare `icon: '/logos/…'` for every panel (7 panels × 12 langs = 84 new lines, mechanical).
  - `bun apps/web/scripts/check-i18n.ts` exits 0.
  - On `/`, the "What can it do?" row shows: 📦 Plugins · 🔧 Tools · 📊 Benchmarks · 📚 Skills · 📖 Knowledge · 🎛 Presets · 🛠 Cross-project setup — each with the icon chosen by the i18n author.
  - Icons re-use existing files in `apps/web/public/logos/` (no new assets).

### S5 — Tighter `PluginDisclosure` icon fallback + author a SKILL

- **Status**: pending
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/components/PluginDisclosure.astro`, `apps/web/src/components/PluginCapabilities.astro`, `docs/mcp-vertex/skills/tabs-component/SKILL.md` (new)
- **Gate**: `bun run lint:skills && bun run typecheck`
- **Command**: `bun run lint:skills && bun run typecheck`
- **Expect**: exit0
- **Acceptance:**
  - When `/logos/plugin-<slug>.svg` 404s (e.g. for a not-yet-shipped plugin), the user sees a coloured circular badge with the first letter of the slug (`P` for `proposals`, `M` for `memory`, …) instead of the raw slug text.
  - `SKILL.md` exists under `docs/mcp-vertex/skills/tabs-component/`, references both `Tabs.astro` and `brand-logos.ts`, and is included by the build's skill index.
  - `bun run lint:skills` exits 0 (the gate that verifies every skill is referenced + complete).

## dependency graph

S1 has no dependency (the cross-fade + PluginTabs merge is the
foundation). S3 reads the `icon?` prop added by S1 and extends it
across two consumers. S4 sits on top of S3 (the `IHomeAtAGlanceTranslations`
icon field is consumer-facing). S2 and S5 are independent cleanups
that ship any time after S1 closes.

```
S1 (cross-fade + PluginTabs merge)
├── S2 (extract tabs CSS into _tabs.scss) — parallel-clean
├── S3 (icon? prop + PM logos on home/install) — depends on S1 prop hook
│   └── S4 (i18n icon field + 12 langs + at-a-glance icons) — depends on S3
└── S5 (PluginDisclosure fallback + SKILL.md) — parallel-clean
```

## acceptance

After all five slices close:

- `bun run validate` exits 0.
- `/` shows the "Quick install" row with five brand-mark PMs and the
  "What can it do?" row with seven section icons.
- Switching tabs on any `<Tabs>` (home, install, first-5-minutes,
  plugin pages) animates with the new cross-fade — verified by a
  recorded interaction (out of scope for automation; review manually).
- `apps/web/src/components/PluginTabs.astro` no longer exists;
  `PluginPage.astro` uses `<Tabs variant="plugin">`.
- `docs/mcp-vertex/skills/tabs-component/SKILL.md` documents the API.

## risks and mitigations

- **Layout shift during the cross-fade.** The two panels overlap
  briefly; if their heights differ, the layout below jumps. Mitigation:
  the controller measures `panel.offsetHeight` on activation and pins
  `.ui-tabs__panels { min-height: <px> }` for the duration of the
  transition. If the spec exposes flakiness in review, fallback to a
  `display: grid` two-track layout (more code, no jump ever).
- **Rapid clicks during the transition.** Cancelled via `{ once: true }`
  on the `animationend` listener; the next click removes the leaving
  class early and the controller's `setTimeout` fallback (260 ms)
  cleans up regardless. The cross-fade spec exercises this with a
  back-to-back-click sequence.
- **i18n gate on S4.** The 12-lang `icon:` addition is mechanical (84
  lines). Mitigation: use the inject script pattern from previous
  proposals (e.g. f00066) so all 12 languages land in one atomic write,
  re-syncing the index.
- **PluginTabs consumers besides `PluginPage`.** `PluginTabs.astro`
  has a unique `data-plugin-tabs` selector; a `grep_search` for it
  across `apps/web/src/components` confirms `PluginPage.astro` is the
  sole consumer before deletion.

## notes

- **f00049** is in flight; if its `PluginTabs` consolidation happens
  first, S1 here is a no-op (just verify the merged version still has
  the cross-fade — and if not, port it). The `related:` link flags
  this.
- **f00059** owns the i18n surface broadly. S4 here adds one optional
  field (`icon?`) to a single interface
  (`IHomeAtAGlanceTranslations.panels[]`); no schema churn. The
  `related:` link flags it so the f00059 owner sees the change.
- **f00060** moves CSS into component tokens. S2 here moves tabs CSS
  into a `components/` partial — same direction, not in conflict.