---
name: tabs-component
appliesTo: ['@mcp-vertex/*']
description: The shared `<Tabs>` component + the `brandLogo()` resolver that every Astro component reaches for to render a brand mark. f00069. Use whenever you add a tab strip, a tab that wants an icon, or any place that needs a logo under `apps/web/public/logos/`.
---

# tabs-component (f00069)

The home page's at-a-glance strip, the install-page PM tabs, and every
plugin disclosure card share one tab strip and one brand-mark resolver.
This skill documents both, plus the hard rule that connects them.

## 1. The `<Tabs>` component

`apps/web/src/components/ui/Tabs.astro` is the single ARIA-correct tab
strip. It supersedes the deleted `PluginTabs.astro` (f00069 S1).

### Props

```ts
interface Props {
  readonly tabs: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly badge?: string;
    /** Public URL or `/logos/...` path; rendered as an 18×18 `<img>`
     *  before the label. Falls back to a first-letter circular badge
     *  if the file 404s. */
    readonly icon?: string;
  }>;
  readonly defaultTab?: string;
  readonly variant?: 'underline' | 'pill' | 'plugin';
  readonly label?: string;
}
```

### Variants

- `underline` (default) — bar with a 2px bottom border; matches the
  install-page PM strip.
- `pill` — no border, pill-shaped active background.
- `plugin` — reproduces the deleted `PluginTabs.astro` look: rounded
  tab, 0.5rem 0.9rem padding, 600-weight active label, 2px border-bottom.

### Panel contract

Each panel must be a `<section data-tab-panel={id} hidden={...}>` child
of `<Tabs>`. The component renders **all** panels server-side so no-JS
users see every section; the controller just hides non-active panels
on hydration.

### Cross-fade behaviour (f00069 S1)

When a tab is activated the controller adds `is-leaving` to the outgoing
panel and `is-entering` to the incoming one. Both stay visible for 220 ms
(`cubic-bezier(0.2, 0.7, 0.2, 1)`). The outgoing panel's `hidden` is set
on `animationend`.

`@media (prefers-reduced-motion: reduce)` disables the animations entirely;
the controller still flips visibility, just without motion.

### Icon fallback (shared contract)

When the `<img>` for a tab icon 404s, the `onerror` handler replaces it
with a `<span class="ui-tabs__icon ui-tabs__icon--fallback">` whose text
is the first letter of the tab id (uppercased, 600-weight). This is the
**shared** fallback used by:

- `Tabs.astro` (the `.ui-tabs__icon--fallback` variant; 18×18)
- `PluginDisclosure.astro` (the `.plugin-card__icon--fallback` variant; 36×36)
- `PluginCapabilities.astro` (the `.pd__icon-fallback` variant; inside a
  26×26 wrapper — keeps the size appropriate to its container)

The onerror expression is always of the form
`this.replaceWith(Object.assign(document.createElement('span'), { className: '<local-class>', textContent: (this.dataset.tabId||'').charAt(0) }))`.
The class name varies because the visual sizing varies; the **strategy**
is shared.

## 2. The `brandLogo()` resolver

`apps/web/src/lib/brand-logos.ts` is the single source of truth for
"which brand mark file exists in `public/logos/`?". Every Astro
component that needs a logo calls this — never hardcodes
`/logos/<prefix>-${id}.${ext}`.

### API

```ts
export type LogoKind = 'pm' | 'ide' | 'plugin' | 'lang' | 'section' | 'lib';

export const KIND_PREFIX: Record<LogoKind, string> = {
  pm: '',         // <id>.<ext>            — npm.svg, bun.svg …
  ide: 'ide-',    // ide-<id>.<ext>        — ide-vscode.svg …
  plugin: 'plugin-', // plugin-<id>.<ext>  — plugin-proposals.svg …
  lang: 'lang-',  // lang-<id>.<ext>       — lang-vue.svg (future)
  section: 'section-', // section-<id>.<ext>
  lib: '',        // <id>.<ext>            — github.png, node.png …
};

export const brandLogo = (id: string, kind: LogoKind = 'pm'): string | null;
export const brandLogosInventory = (): ReadonlyArray<{ file: string; ext: 'svg'|'png'|'ico'|'other' }>;
```

`EXTS` priority is `['svg', 'png', 'ico']` — the first file that
exists wins. The function is sync, never throws, and returns `null`
when nothing matches (the resolver must not crash on missing assets;
the call site falls back to the first-letter badge).

### When to add a new kind

Add a new entry to `LogoKind` + `KIND_PREFIX`. The data-driven map
means there is no `else if` chain to update. Then add the kind to
the existing test in `apps/web/tests/lib/brand-logos.spec.ts` so the
union's exhaustiveness is pinned.

## 3. The hard rule

**No hardcoded `/logos/...` strings — always go through `brandLogo()`.**

This applies to every component (`.astro`, `.ts`, `.tsx`) in
`apps/web/`. Exceptions are documented in the file's top comment and
require an explicit allow-list entry (none exist today). Tests in
`apps/web/tests/lib/brand-logos.spec.ts` pin the union and the prefix
map; touching this contract is a 1-line edit.

Adding a new logo file under `public/logos/` is not enough — the
resolver must resolve to it via `brandLogo()`. The
`brandLogosInventory()` helper is what the fetch-script uses to know
what's missing; it is also what the test asserts (≥ 43 files,
non-empty diff against a missing file).

## 4. Worked example

Adding a "Languages" tab to the install page:

```astro
---
import Tabs from '#UI/Tabs.astro';
import { brandLogo } from '#LIB/brand-logos';

const langs = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python',     label: 'Python' },
  { id: 'rust',       label: 'Rust' },
] as const;

const tabs = langs.map((l) => ({
  id: l.id,
  label: l.label,
  icon: brandLogo(l.id, 'lang') ?? undefined, // resolver returns null
                                               // until lang-ts.svg etc.
                                               // are published
}));
---
<Tabs tabs={tabs} variant="pill" label="Languages">
  <section data-tab-panel="typescript" hidden>…</section>
  <section data-tab-panel="python" hidden>…</section>
  <section data-tab-panel="rust" hidden>…</section>
</Tabs>
```

Two things to notice:

1. The `icon: brandLogo(...) ?? undefined` keeps the `icon?` field
   absent (not `null`) when no file exists, so the conditional in
   `Tabs.astro` cleanly skips rendering the `<img>`.
2. If the file exists but 404s at request time (stale CDN, wrong
   filename), the `onerror` handler swaps in the first-letter
   fallback — the tab is never blank.
