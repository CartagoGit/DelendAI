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
shipped-in:
    - c4178209 # feat(tabs): cross-fade in Tabs.astro + delete PluginTabs.astro + wire PluginPage to <Tabs variant="plugin"> (S1, also shipped the external MCP docs bundle)
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
   `icon?` prop), wire it in `HomeQuickInstallSection`,
   `HomeAtAGlanceSection`, and **extend the resolver itself** with
   three new kinds (`'plugin'`, `'lang'`, `'section'`) so every
   consumer — including the existing `PluginDisclosure.astro` and
   `PluginCapabilities.astro`, both of which currently hardcode
   `/logos/plugin-${slug}.svg` — funnels through one helper. The
   fallback in `PluginDisclosure` becomes the same first-letter
   circular badge that `Tabs.astro` uses for missing logos.

   > **Note (2026-06-27):** S3 of this proposal was planned against
   > `apps/web/src/components/Install.astro`, but f00055 S6 migrated
   > `/install` to a PageSpec served by `[page].astro` /
   > `[lang]/[page].astro` from
   > `apps/web/src/data/pages/install/*.md`. `Install.astro` no longer
   > exists, so the "On `/install`" acceptance line in S3 must be
   > re-scoped (icons inside the markdown, or skip and rely on the
   > home page's `HomeQuickInstallSection`). S3 is marked
   > `pending` again until that re-scoping lands.

The reuse rule (`AGENTS.md` §Hard rules §2 and §4: "no `process.cwd()`"
and "durable writes through the primitives") generalises: any
component that needs a brand mark goes through `brandLogo(id, kind)`
— never hardcodes the path. S5 turns this into a hard contract.

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
- `apps/web/src/data/pages/install/*.md` — (S3, deferred) the markdown
  PM rows would need a custom renderer or shortcode to render icons;
  tracked in the S3 follow-up note above.
- `apps/web/src/components/PluginDisclosure.astro` — replaces
  hardcoded `/logos/plugin-${slug}.svg` + bespoke `onerror` with a
  single `brandLogo(slug, 'plugin')` call (S5).
- `apps/web/src/components/PluginCapabilities.astro` — same reuse
  refactor as `PluginDisclosure.astro` (S5).
- `apps/web/src/lib/brand-logos.ts` — **extended**, not just verified.
  S5 adds three new kinds (`'plugin'`, `'lang'`, `'section'`) and one
  `'lib'` kind so every `/logos/<prefix>-<id>.<ext>` file in
  `public/logos/` resolves through the single helper. Today the
  module only knows `'pm'` (no prefix) and `'ide'` (`ide-` prefix);
  all 16 `plugin-*.svg`, the `lang-` family (see S5 for the inventory),
  and any future `section-*.svg` go through this one function.
  The contract stays the same: `brandLogo(id, kind)` returns the
  public URL or `null`. Backward-compatible — existing `'pm'` and
  `'ide'` callers are unchanged.
- `apps/web/src/i18n/shared.ts` — adds `icon?: string` to
  `IHomeAtAGlanceTranslations.panels[number]`.
- `apps/web/src/i18n/langs/*.ts` (12 languages) — adds `icon:` to
  each `panels[i]`.
- `apps/web/src/styles/components/_tabs.scss` — new partial extracted
  from Tabs.astro.
- `apps/web/src/styles/styles.scss` — registers the new partial.
- `apps/web/tests/ui/tabs-cross-fade.spec.ts` — new spec covering the
  cross-fade + `plugin` variant merge.
- `apps/web/tests/lib/brand-logos.spec.ts` — new spec covering the
  three new kinds (S5).
- `docs/mcp-vertex/skills/tabs-component/SKILL.md` — new SKILL
  documenting the API.

### Why a single resolver (the reuse rule)

`apps/web/public/logos/` already ships 43 brand marks:

- **5 package managers** (npm, pnpm, yarn, bun, deno) — `bun.svg`,
  `deno.svg`, `npm.svg`, `pnpm.svg`, `yarn.svg`.
- **5+ IDEs** (vscode, cursor, windsurf, zed, antigravity, claude-code,
  claude-desktop) — `ide-*.svg|png|ico`.
- **16 plugins** (proposals, memory, quality, …) — `plugin-*.svg`.
- **5 libraries/runtime marks** (github, node, typescript, git,
  modelcontextprotocol) — `<bare>.png/svg`.

Adding **more** kinds (language, framework, section, …) without
funneling them through `brand-logo.ts` would mean every consumer
hardcodes `/logos/<prefix>-${id}.<ext>` again — that's the reuse
violation we explicitly want to avoid. S5 turns `brand-logo.ts` into
**the** single helper every Astro component reaches for, with a `Kinds`
map so the prefix scheme is data-driven (not a 4-way `if`):

```ts
// new in brand-logo.ts (S5)
type LogoKind = 'pm' | 'ide' | 'plugin' | 'lang' | 'section' | 'lib';
const KIND_PREFIX: Record<LogoKind, string> = {
  pm: '',
  ide: 'ide-',
  plugin: 'plugin-',
  lang: 'lang-',
  section: 'section-',
  lib: '',
};
export const brandLogo = (id: string, kind: LogoKind = 'pm'): string | null => { … };
```

Adding a new kind is one line. The `EXTS` priority list (`svg, png,
ico`) keeps the format fallback. The inventory helper
(`brandLogosInventory()`) becomes the source of truth for what
exists.

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
  - `_tabs-controller.ts` keeps its existing public surface (`initTabs`, `bindOne`) so other consumers (`FirstFiveMinutesSection`, `HomeQuickInstallSection`, `HomeAtAGlanceSection`) need no edit.
- **Reconciliation note (2026-06-30):** S1's cross-fade controller, the
  `variant: 'underline' | 'pill' | 'plugin'` union, the icon prop, and the
  deletion of `PluginTabs.astro` were all already in the tree and
  validate-green. One leftover bug from the merge was fixed during this drain:
  `PluginPage.astro` closed the `<Tabs variant="plugin">` element with a stray
  `</PluginTabs>` tag and dropped the closing `}` of the tutorial-panel
  conditional. Astro tolerated the malformed markup so validate stayed green,
  but it now closes with the matching `</Tabs>` and a well-formed `)}`
  (commit `42e81af5`).

### S2 — Extract tabs CSS into a component partial

- **Status**: done
- **Owner**: `implementation_runner`
- **Shipped-in**:
  - `172e4fd3` # refactor(web): extract tabs CSS into _tabs.scss partial (f00069 S2)
  - `42e81af5` # fix(web): close PluginPage tabs with </Tabs> + missing JSX brace (S1 cleanup that this slice rode on top of)
- **Files**: `apps/web/src/styles/components/_tabs.scss` (new), `apps/web/src/styles/styles.scss`, `apps/web/src/components/ui/Tabs.astro`, `apps/web/tests/ui/tabs-cross-fade.spec.ts` (CSS-contract assertions re-pointed at the partial)
- **Gate**: `bun run lint:scss && bun run lint:web`
- **Command**: `bun run lint:scss && bun run lint:web`
- **Expect**: exit0
- **Acceptance:**
  - All `.ui-tabs__*` selectors live in `_tabs.scss`. The component's `<style>` block shrinks to ≤ 5 lines (or is gone entirely).
  - The cross-fade `@keyframes` (`ui-tab-fade-in` + `ui-tab-fade-out`) and the `.is-leaving` / `.is-entering` rules land here, not in a `<style>` block inside the component.
  - No visual regression on `/install`, `/first-5-minutes`, `/`, or any `/plugins/<slug>` page.
  - **Reconciliation note (2026-06-30):** all `.ui-tabs__*` rules now live in
    `_tabs.scss`; `Tabs.astro` carries **no** `<style>` block (an HTML comment
    points at the partial). The partial is authored as nested BEM
    (`&--underline` / `&--pill` / `&--plugin` modifiers; `&`-rooted
    `[data-tab-panel]` selectors; reduced-motion media query nested under
    `&__panels`) to satisfy the `scoped-bem/selector` stylelint rule and the
    `max-nesting-depth: 3` budget. The S1 cross-fade spec's three CSS-contract
    assertions were re-pointed from `Tabs.astro` to `_tabs.scss`.

### S3 — Tab `icon?` prop + wire PM logos into `HomeQuickInstallSection`

- **Status**: pending
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/components/ui/Tabs.astro`, `apps/web/src/components/HomeQuickInstallSection.astro`, `apps/web/src/lib/brand-logos.ts`, `apps/web/src/styles/components/_tabs.scss`, and (deferred) a markdown-side hook for `apps/web/src/data/pages/install/*.md`
- **Gate**: `bun run typecheck`
- **Command**: `bun run typecheck`
- **Expect**: exit0
- **Acceptance:**
  - `Tabs` renders an `<img class="ui-tabs__icon" width="18" height="18" alt="" loading="lazy">` before the label when `tabs[i].icon` is truthy; nothing renders when it isn't.
  - On `/`, the "Instalación rápida" row shows: 🟥 npm · 🟧 pnpm · 🟪 yarn · 🟫 bun · ⚫ deno (their actual brand marks).
  - On `/install` (markdown-backed since f00055 S6): the PM rows show the same 5 icons — implementation deferred until a markdown-side renderer or shortcode is decided; tracked in the S3 follow-up note above.
  - Fallback for missing logos: a 1-letter placeholder (`n`, `p`, `y`, `b`, `d`) in the same slot — implemented as `onerror` on the `<img>` (same pattern as `PluginDisclosure.astro`).
- **Reconciliation note (2026-06-30):** the home-page half of S3 is **already
  in the tree** and validate-green — `Tabs.astro` renders the `ui-tabs__icon`
  `<img>` with the `onerror` first-letter fallback when `tabs[i].icon` is set
  (`apps/web/src/components/ui/Tabs.astro`), and `HomeQuickInstallSection.astro`
  passes `icon: brandLogo(pm.id, 'pm') ?? undefined` for every PM
  (`apps/web/src/components/HomeQuickInstallSection.astro:41`). The
  `brand-logos.ts` resolver hook is present too. The **only** unmet acceptance
  line is the `/install` markdown one: since f00055 S6 migrated `/install` to a
  PageSpec markdown (`apps/web/src/data/pages/install/*.md`, which today carry
  **no** icon support and no shortcode/renderer for them), wiring PM icons into
  those markdown rows needs a markdown-side renderer decision that has not
  landed. S3 therefore stays **pending** for that one deferred line; the rest is
  done.

### S4 — Section icons in `HomeAtAGlanceSection` + 12-lang i18n

- **Status**: done
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

### S5 — Extend `brand-logos.ts` + refactor `PluginDisclosure`/`PluginCapabilities` to reuse it + author a SKILL

- **Status**: done (code) — **SKILL.md item deferred, see reconciliation note**
- **Owner**: `implementation_runner`
- **Files**: `apps/web/src/lib/brand-logos.ts`, `apps/web/src/components/PluginDisclosure.astro`, `apps/web/src/components/PluginCapabilities.astro`, `apps/web/tests/lib/brand-logos.spec.ts` (new), `docs/mcp-vertex/skills/tabs-component/SKILL.md` (new — **deferred**, prescribed path is obsolete; see note)
- **Gate**: `bun run typecheck && bun run test apps/web/tests/lib/brand-logos.spec.ts && bun run lint:skills`
- **Command**: `bun run typecheck && bun run test apps/web/tests/lib/brand-logos.spec.ts && bun run lint:skills`
- **Expect**: exit0
- **Acceptance:**
  - `brand-logo.ts` exports `type LogoKind = 'pm' | 'ide' | 'plugin' | 'lang' | 'section' | 'lib'` and a `KIND_PREFIX` map. The existing `brandLogo(id, 'pm' | 'ide')` callers are unchanged (backward-compatible).
  - For each new kind, the function walks `apps/web/public/logos/<prefix><id>.{svg,png,ico}` and returns the first hit (same `EXTS` priority order). All 16 `plugin-*.svg` resolve; the existing 5 PMs + 5+ IDEs continue to resolve.
  - `PluginDisclosure.astro` and `PluginCapabilities.astro` stop hardcoding `/logos/plugin-${slug}.svg` + a bespoke `onerror`. They call `brandLogo(slug, 'plugin')` (or the centralised `<PluginIcon slug={…} />` primitive if the SKILL prescribes one) and get the same URL — the diff between the two files for icon handling is now ≤ 3 lines (the fallback `onerror`).
  - When the plugin icon 404s, the user sees a coloured circular badge with the first letter of the slug (`P` for `proposals`, `M` for `memory`, …) instead of the raw slug text — same rule as S3's PM tabs.
  - `apps/web/tests/lib/brand-logos.spec.ts` exists and covers at minimum: (a) every existing PM id resolves; (b) every existing IDE id resolves; (c) every existing `plugin-*.svg` resolves through `'plugin'`; (d) unknown id returns `null`; (e) `KIND_PREFIX` map covers all six kinds and `lang` / `section` kinds degrade to `null` cleanly because no `lang-*.svg` / `section-*.svg` files exist yet (the resolver must not crash on an empty result).
  - `docs/mcp-vertex/skills/tabs-component/SKILL.md` documents the **unified** Tabs + brand-logo API: how to pick a tab variant, when to use `icon?`, how to call `brandLogo()` for any kind, and the rule "no hardcoded `/logos/...` strings — always go through `brandLogo()`".
  - `bun run lint:skills` exits 0 (the gate that verifies every skill is referenced + complete).
- **Reconciliation note (2026-06-30):** the **code** half of S5 is already in
  the tree and validate-green: `brand-logos.ts` exports the six-kind `LogoKind`
  union + the `KIND_PREFIX` map (`apps/web/src/lib/brand-logos.ts:71,82`);
  `PluginDisclosure.astro` and `PluginCapabilities.astro` funnel through
  `brandLogo(slug, 'plugin')` with the first-letter `--fallback` badge
  (`PluginDisclosure.astro:39`, `PluginCapabilities.astro:115`); and
  `apps/web/tests/lib/brand-logos.spec.ts` covers all six kinds + the
  negative/`lib` paths (`bun run test` green).
  - **SKILL.md is DEFERRED, not landed.** The prescribed path
    `docs/mcp-vertex/skills/tabs-component/SKILL.md` is **obsolete**: as of
    f00065 S1 (`docs/mcp-vertex/skills/README.md`), skills no longer live under
    `docs/` — every skill lives with its owning package/plugin
    (`packages/core/skills/<name>/SKILL.md` or
    `plugins/<plugin>/skills/<name>/SKILL.md`) and is registered in
    `packages/core/skills/manifest.json`. The `lint:skills` gate
    (`tools/scripts/lint/skills-script.ts`) validates **only** that manifest's
    `bodyPath`s + id-uniqueness — it does **not** scan `docs/`, so a `docs/`
    SKILL would be invisible to its own acceptance gate.
  - A `tabs-component` skill is a **web/UI documentation artifact**, not an MCP
    runtime skill: it has no `appliesTo` namespace (`@mcp-vertex/*` or a
    plugin), so it does not fit the manifest model without inventing a synthetic
    owner. Authoring it as prescribed would be unsafe (wrong location, ungated);
    re-scoping it (e.g. fold the Tabs + `brandLogo()` API guidance into an
    existing core skill, or ship a dedicated web-docs page) needs a decision out
    of scope for this drain. The brand-logo "single resolver" contract is
    already enforced in code + spec, so the deferral does not leave the reuse
    rule unprotected.

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