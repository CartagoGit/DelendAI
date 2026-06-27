---
id: f00055
status: done
type: proposal
track: apps/web+packages/ui-extension+apps/shared+i18n+ux+tooling
date: 2026-06-24
closed: 2026-06-27
kind: feat
title: Web repaso — fix the More dropdown, audit every page, and introduce PageSpec so adding pages is 1 file change instead of 12
shipped-in:
    - 03aef5f5 # feat: enhance dropdown functionality and styling in SiteNav (S1)
    - 0f677670 # feat(shared): f00055 S2 — ship mv-dropdown__* component styles for non-web hosts
    - 31dd5508 # feat(web): f00055 S3 — page audit (PAGES_AUDIT + typed PAGES_AUDIT.json)
    - b97436d2 # feat(web): f00055 S4 — PageSpec types + reader (canonical content contract)
    - 3e9ed633 # feat(web): f00055 S4 cherry-picked onto develop to unblock S5's #LIB/page-spec/reader import
    - fb10602a # feat(web): f00055 S5 — MarkdownPage renderer + dynamic route + gen-pages
    - 4604d6c5 # fix(web): finish f00055 s5 runtime and audit wiring (package.json imports + MarkdownPage class + stylelint BEM + new audit entries)
    - 71d0afb4 # feat(web): f00055 S6 — convert /install to PageSpec (12 markdown pilot)
    - 45d403fe # fix(web): sync pages audit after install PageSpec pilot
    - 306b55e8 # docs(proposals): f00055 — mark done and move to done/feats
    - 698f3565 # docs(f00055): mark S2 + S4 + S5 done (correct entry + MarkdownPage pipeline)
    - 635f355e # style(proposals): fix biome lint warnings in x00052/x00053 files (carries the S2 _index.scss canonical-entry fix into develop)
recan: []
related:
    - f00053 # canonical plugin catalog + per-plugin disclosures (S1–S5 ships the content surface this proposal refactors)
    - f00049 # conventions unification (shares the i18n slot — S7 owns de-hosting; this proposal owns the page-content contract)
    - f00047 # apps/shared i18n (the consumer of PageSpec)
ownership:
    - { agent: implementation_runner, task: 'S1: fix the More dropdown — make renderDropdown accept an idPrefix so the web can produce the IDs its JS+CSS expect, and switch SiteNav to the prefixed form' }
    - { agent: implementation_runner, task: 'S2: ship mv-dropdown__* styles in @mcp-vertex/shared so the dropdown works in any host (web + vscode) without per-host CSS duplication' }
    - { agent: proposal_guardian,    task: 'S3: audit the 16 pages (apps/web/src/pages/) — produce a PAGES_AUDIT table with status (keep/shelve/rewrite/merge) for each, surfaced as docs/PAGES-AUDIT.md and a typed PAGES_AUDIT.json the build can consume' }
    - { agent: implementation_runner, task: 'S4: define PageSpec = { frontmatter, body (markdown), translations: Record<Lang, {body, frontmatter}> } in apps/web/src/lib/page-spec/ as the canonical content contract for content-driven pages' }
    - { agent: implementation_runner, task: 'S5: ship the MarkdownPage.astro renderer + i18n pipeline (read markdown per Lang, render via existing prose styles, register keys in apps/web/src/i18n/)' }
    - { agent: implementation_runner, task: 'S6: convert /install as the pilot — install.<lang>.md under apps/web/src/data/pages/install/, regenerate via bun scripts/gen-pages.ts, add gen-pages.ts to the build chain (gen:manifests target)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run lint:tools,                expect: exit0 }
    - { command: bun run check:i18n,                expect: exit0 }
    - { command: bun run site:strict,               expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
---

# f00055 — Web repaso: fix the More dropdown, audit every page, and introduce PageSpec so adding pages is 1 file change instead of 12

## Goal

Three user-visible defects in the docs site (`apps/web`) need a single coordinated fix, plus a structural change so future page authoring stops being a 12-language copy/paste exercise:

1. **The "More" dropdown in the top nav does not open.** Visually it appears to register a click (`aria-expanded` flips) but no menu ever renders — see the live capture below.
2. **The home page looks cramped on common widths** — copy stacks in a narrow column instead of using the available container (`--maxw: 68rem` ≈ 1088 px) cleanly. This is partly a viewport artefact from the embedded browser but also reflects that several sections were not designed against the 7-1 layout primitives (container / section / grid).
3. **Adding a new page (or any meaningful copy change to an existing one) requires editing the same string in 12 language files.** The docs site has 16 hand-written `pages/*.astro` files and `apps/web/src/i18n/{en,es,fr,de,pt,it,zh,hi,ar,ja,vi,th}.ts` with 12 parallel copies of every key. The "add a paragraph" workflow is fragile, easy to drift, and the source of every `check-i18n` warning.

The proposal closes those three gaps with a single coherent plan. The dropdown fix (S1+S2) unblocks the chrome; the page audit (S3) gives a defensible "what stays / what goes" answer; PageSpec (S4–S6) is the long-term fix that makes "add a page" mean "edit 1 markdown file (or 12 if you want translated versions), the rest is automated".

## Why

### Why the dropdown is broken (S1/S2)

`apps/web/src/components/SiteNav.astro` imports `renderDropdown` from `@mcp-vertex/shared` (re-exported from `@mcp-vertex/ui-extension/src/components/dropdown.ts`). That helper produces this HTML shape:

```html
<div id="nav-more" class="mv-dropdown" data-mv-dropdown="nav-more">
  <button class="mv-dropdown__trigger" aria-haspopup="true" aria-expanded="false"
          aria-controls="nav-more-menu" data-mv-toggle="dropdown" data-mv-dropdown-id="nav-more">
    More ▾
  </button>
  <ul id="nav-more-menu" class="mv-dropdown__menu mv-dropdown__menu--right" role="menu"
      aria-labelledby="nav-more-menu" hidden>…items…</ul>
</div>
```

But the JS in the same `<script>` block of `SiteNav.astro` looks for:

```ts
const trigger = document.getElementById('nav-more-trigger');
const panel   = document.getElementById('nav-more-panel');
```

Those IDs **never exist** — the shared helper produces `nav-more` (wrapper) + `nav-more-menu` (panel), not `nav-more-trigger` + `nav-more-panel`. Same story for the CSS: `_nav.scss` defines `.nav__more`, `.nav__more-summary`, `.nav__more-panel`, `.nav__more--open`, none of which apply to the `mv-dropdown__*` classes that the helper emits. The `mv-dropdown__*` styles don't exist anywhere in the web bundle either (`apps/shared/src/styles/styles.scss` only `@forward 'tokens'` and `'themes'` — the component CSS is exported as a runtime string from `@mcp-vertex/ui-extension/src/styles.css.ts` and is intended for in-IDE use, not for the docs site).

So the click is observed by the browser (`aria-expanded` flips via the `data-mv-toggle="dropdown"` runtime contract that **also** isn't shipped to the web), nothing binds because the IDs mismatch, and the panel stays at `transform: scaleY(0); opacity: 0; visibility: hidden` from `_nav.scss` defaults.

The fix is **not** to fork the helper. The fix is:

- (S1) Make `renderDropdown` accept an `idPrefix` option (default = `'mv'` for backward compatibility with extensions that consume `mv-dropdown__*`) so the web can ask for `id="nav-more-trigger"`, `id="nav-more-panel"`, classes prefixed `nav__more-*` etc. — keeping its own JS+CSS contract.
- (S2) ALSO ship the shared `mv-dropdown__*` styles into `@mcp-vertex/shared/styles` so **future hosts** that want the default look don't have to duplicate CSS either. The web keeps its nav styling (it already has the SCSS that matches its visual design); the extension uses the shared default. One helper, two presets, zero fork.

### Why the home looks cramped (S2 of dropdown fix flows into the page audit)

The container itself is fine (`--maxw: 68rem` from `_tokens.scss`). The "cramped" perception comes from:

- Several sections of the home (`ConceptSection`, `marquees`) lack `display: grid`/`gap` rules that use the section-level grid primitive (`components/_section.scss`), so they fall back to a single-column flow at any width.
- The embedded browser snapshot was taken at a viewport narrower than 1088 px so the container collapsed correctly but the inner grid wasn't designed to fill it.

These are addressed in S3 (audit → "rewrite" flag for those sections) and S4 (PageSpec gives the page author predictable layout primitives).

### Why PageSpec (S4–S6)

Today the docs site ships **content** in two parallel forms:

1. `apps/web/src/i18n/{lang}.ts` — every user-visible string keyed by `nav.home`, `hero.title.a`, `install.step1`, etc. 12 files, ~600+ keys each, every addition requires 12 edits.
2. `apps/web/src/pages/*.astro` — every long-form page is a hand-written Astro file with hardcoded copy in one language, mostly English, with translation-by-i18n-key for any label.

That works for **structure** (the page layout is in `.astro`) but it kills **velocity** for **content**. Adding a paragraph to `/guide` means:
1. Edit `apps/web/src/pages/guide.astro` (English).
2. Edit `apps/web/src/i18n/en.ts` (English base keys).
3. Edit 11 other `i18n/<lang>.ts` files.
4. Run `bun run check:i18n` to verify all keys still match.
5. Run `bun run site:strict` to verify the build still passes.

5 steps, every one of them a "did I forget a language?" trap. The `check-i18n` script catches the *structural* drift (keys missing in some languages) but it cannot catch *content* drift (one language getting a newer paragraph than the others).

PageSpec inverts the model:

- Content lives in `apps/web/src/data/pages/<slug>/<lang>.md` (12 markdown files per page, one per language).
- Layout lives in `apps/web/src/components/MarkdownPage.astro` (one renderer).
- i18n stays for chrome (nav labels, hero CTA text, etc.) where the parallel-by-language model is fine because the strings are short and stable.
- The new `gen-pages.ts` script enumerates `apps/web/src/data/pages/**` and emits `apps/web/src/data/manifests/pages.json` — the build pipeline already regenerates `capabilities.json` from the live tool registry, so adding `pages.json` from the live markdown is the same pattern (canonical content → generated manifest → page reads the manifest).

This is not a CMS, and it deliberately isn't. Markdown files in git are diffable, reviewable in PRs, and work with every editor. Adding a page is "drop 12 markdown files in `apps/web/src/data/pages/<slug>/`" (or just 1 + let an agent fill in the others). Removing a page is "delete the directory". Reordering sections is "edit frontmatter, no code".

## Non-goals

- No CMS, no DB, no runtime translation API. Markdown files in git are the source of truth.
- No move of i18n chrome strings into PageSpec — only long-form page content migrates. Nav labels, button text, hero CTAs stay in `apps/web/src/i18n/*` (the parallel-by-language model is fine for short, stable strings).
- No redesign of the site layout beyond what the dropdown fix + PageSpec renderer need. The page audit (S3) flags candidate rewrites for *future* proposals.
- No breaking change for `@mcp-vertex/ui-extension` consumers. `renderDropdown` keeps its default behavior; the `idPrefix` option is additive.
- No change to any MCP tool surface, plugin behaviour, or core invariant.

## Slices

### S1 — Make `renderDropdown` configurable: accept `idPrefix` + `classPrefix`

- **Files**: packages/ui-extension/src/components/dropdown.ts
- **Files**: packages/ui-extension/tests/components/dropdown.spec.ts
- **Files**: apps/web/src/components/SiteNav.astro
- **Gate**: type
- acceptance:
  - "`IDropdownOptions` accepts an optional `idPrefix` (default `'mv'`) and an optional `classPrefix` (default `'mv-dropdown'`). The produced HTML uses `<idPrefix>-trigger` for the button, `<idPrefix>-menu` for the ul, and the wrapper carries `class="<classPrefix>"` + children with `<classPrefix>__trigger`/`<classPrefix>__menu`/`<classPrefix>__item`/`<classPrefix>__label`/`<classPrefix>__icon`."
  - "Existing callers (extensions/vscode, anything that didn't pass options) see byte-identical HTML to before — the defaults preserve the current `mv-dropdown__*` shape."
  - "`SiteNav.astro` passes `idPrefix: 'nav-more'`, `classPrefix: 'nav__more'` (so the existing `.nav__more-*` SCSS keeps applying) and the existing `#nav-more-trigger` / `#nav-more-panel` JS keeps binding without edits."
  - "A spec asserts the default behavior unchanged and that the prefixed form produces the IDs the web's JS expects."
- **Status**: done

### S2 — Ship `mv-dropdown__*` styles in `@mcp-vertex/shared/styles` for non-web hosts

- **Files**: apps/shared/src/styles/_dropdown.scss
- **Files**: apps/shared/src/styles/_index.scss
- **Files**: apps/shared/src/styles/_dropdown.spec.ts (visual snapshot via vitest + playwright is overkill; assert CSS text + class coverage)
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "`@mcp-vertex/shared/styles` `@forward`s a new `_dropdown.scss` partial that ships the `.mv-dropdown`, `.mv-dropdown__trigger`, `.mv-dropdown__menu`, `.mv-dropdown__menu--left/right`, `.mv-dropdown__item`, `.mv-dropdown__label`, `.mv-dropdown__icon` styles + the `[aria-expanded='true']` open-state variant + the `prefers-reduced-motion` opt-out."
  - "The web keeps using its own `_nav.scss` (the dropdown lives inside `.nav__more` and must match the nav chrome) but the styles are available to any future host that wants the default look."
  - "`apps/shared/src/styles/_dropdown.spec.ts` asserts the partial is `@forward`ed by `_index.scss` (the canonical entry per `apps/web/astro.config.mjs#SHARED_STYLES` and `apps/shared/package.json#exports["./styles"]`) and contains at minimum the seven class selectors above + the open-state rule."
- **Status**: done

### S3 — Page audit: classify every existing page as keep / shelve / rewrite / merge

- **Files**: docs/PAGES-AUDIT.md
- **Files**: apps/web/src/data/pages-audit.ts
- **Files**: apps/web/src/data/pages-audit.spec.ts
- **Gate**: type
- acceptance:
  - "`docs/PAGES-AUDIT.md` lists every file under `apps/web/src/pages/**/*.astro` (the 16 top-level + the `[lang]/` mirrors) with one row per page: `path`, `lang coverage` (which languages render it), `kind` (content / chrome / dynamic), `last meaningful edit` (heuristic — `git log -1 --format=%ci` on the file), `verdict` (keep / shelve / rewrite / merge-into-<other>), `why` (one sentence)."
  - "`apps/web/src/data/pages-audit.ts` exports `PAGES_AUDIT` typed as `readonly IPageAuditEntry[]` so the build can warn (not fail) on `rewrite` / `merge` entries that haven't been acted on yet. A spec asserts the count matches the on-disk page count and that every entry has a verdict."
  - "The audit surfaces at minimum: duplicate pages (`tools.astro` vs `tools/[plugin]/...` vs `tools/[plugin]/[tool].astro`), pages with no real content (404, knowledge — content lives elsewhere), pages whose copy is now stale (`setup.astro` — pre-f00053), and pages that have a clean PageSpec migration target (`install.astro`, `guide.astro`, `first-5-minutes.astro`, `cli.astro`)."
- **Status**: done

### S4 — Define `PageSpec` as the canonical content contract for content-driven pages

- **Files**: apps/web/src/lib/page-spec/types.ts
- **Files**: apps/web/src/lib/page-spec/reader.ts
- **Files**: apps/web/src/lib/page-spec/reader.spec.ts
- **Gate**: type
- acceptance:
  - "`PageSpec` = `{ slug: string; frontmatter: IPageFrontmatter; body: string; translations: Record<Lang, { frontmatter: IPageFrontmatter; body: string }> }` where `IPageFrontmatter` carries `title`, `description`, `order?`, `navLabel?`, `ogImage?`, `noindex?` (mirroring what `Base.astro` already accepts)."
  - "`reader.ts` enumerates `apps/web/src/data/pages/<slug>/` directories and returns one `PageSpec` per slug, validating that (a) at least the English translation exists, (b) frontmatter is parseable, (c) every language the page advertises actually has a file, (d) a `check-i18n`-style parity check on the frontmatter keys."
  - "A spec asserts the reader rejects pages with missing-en, rejects unknown frontmatter keys (Zod schema), and accepts the install pilot (S6) end-to-end."
  - "`reader.ts` is pure (no I/O at the top level — files are read through an injected `readFile` so the spec can run with an in-memory fs)."
- **Status**: done

### S5 — Ship `MarkdownPage.astro` renderer + i18n pipeline for PageSpec pages

- **Files**: apps/web/src/components/MarkdownPage.astro
- **Files**: apps/web/src/styles/components/_markdown-page.scss
- **Files**: apps/web/src/pages/[page].astro (the dynamic route that serves `PageSpec` pages)
- **Files**: apps/web/src/pages/[lang]/[page].astro
- **Files**: apps/web/scripts/gen-pages.ts
- **Files**: apps/web/scripts/gen-pages.spec.ts (idempotency + missing-en assertions)
- **DependsOn**: [S4]
- **Gate**: type
- acceptance:
  - "`MarkdownPage.astro` accepts `page: PageSpec` and `lang: Lang`, renders the `<h1>` from frontmatter, the description, then the markdown body via `markdown-it` (added as a dep — already in the Astro transitive set; verified in S5 prep)."
  - "`[page].astro` is a `getStaticPaths()` route that emits one URL per `PageSpec` slug, one per language; missing-language fallback to English is documented in the route and asserted in the spec."
  - "`scripts/gen-pages.ts` regenerates `apps/web/src/data/manifests/pages.json` from the live `data/pages/**` tree and runs as part of `bun run build` (added to the `gen:manifests` chain — see `apps/web/package.json`)."
  - "A spec asserts `gen-pages.ts` is idempotent, that running it twice produces a byte-identical `pages.json`, and that the script fails (non-zero exit) when a page has no English translation."
- **Status**: done

### S6 — Pilot: convert `/install` to PageSpec + regenerate

- **Files**: apps/web/src/data/pages/install/{en,es,fr,de,pt,it,zh,hi,ar,ja,vi,th}.md
- **Files**: apps/web/src/pages/install.astro (delete, replaced by [page].astro)
- **Files**: apps/web/src/pages/[lang]/install.astro (delete)
- **Files**: apps/web/src/i18n/*.ts (drop the `install.*` keys that move into the markdown)
- **Files**: apps/web/scripts/gen-pages.ts
- **DependsOn**: [S3, S4, S5]
- **Gate**: type
- acceptance:
  - "12 `install.<lang>.md` files exist under `apps/web/src/data/pages/install/`, each with the same frontmatter shape, each carrying the install-step content currently inlined in `install.astro` (translated). The English file is reviewed by the maintainer; the other 11 are produced via the existing `apps/web/scripts/check-i18n.ts` parity rules + a translate pass (the proposal does NOT ship automated translations — the maintainer reviews them, just like today)."
  - "`pages/install.astro` and `pages/[lang]/install.astro` are deleted; the dynamic route from S5 serves `/install` and `/<lang>/install` from the PageSpec."
  - "`bun run check:i18n` still passes (the `install.*` keys removed from `i18n/*.ts` were only referenced from the deleted page; the spec asserts no orphan references remain)."
  - "Visually `/install` matches the previous page within the prose styles — the maintainer signs off in the PR."
- **Status**: done

## Architecture

- **`renderDropdown` consumers**: extensions/vscode keeps working byte-identically (S1's defaults). The 1-line `renderDropdown({idPrefix: 'nav-more', classPrefix: 'nav__more', ...})` change in SiteNav is the only caller-side edit.
- **`@mcp-vertex/shared/styles`**: gains a new partial (`_dropdown.scss`) that is `@forward`ed, so anyone consuming the shared bundle gets the dropdown look for free (S2).
- **i18n**: the `install.*` keys move from `i18n/*.ts` into `data/pages/install/*.md` (S6). No other i18n keys are touched. `check-i18n` continues to gate.
- **Build chain**: `gen-pages.ts` slots into `gen:manifests` (called by `build`, `build:strict`, `dev`, `check`) so every existing entry point regenerates `pages.json` before the Astro build runs.
- **Memory**: page audit + PageSpec decision lives in `memories/repo/pages-audit-and-pagespec.md` so future page work doesn't have to rediscover the contract.

## Acceptance

1. Visit `/` in a real browser at 1280 px — hero copy uses the full container width, "More" dropdown opens on click and closes on outside-click / Escape (S1+S2).
2. Visit `/install` — visually identical to before, but the source is 12 markdown files instead of 1 astro file + 12 i18n entries (S6).
3. Add a new page: drop `apps/web/src/data/pages/getting-started/{en,es,...}.md`, run `bun run gen:manifests`, the page exists at `/getting-started` and `/<lang>/getting-started` with zero code changes (S4+S5).
4. `bun run validate` green; `bun run site:strict` green; `bun run check:i18n` green.

## Dependency graph

- f00053 S1–S5 ship the canonical plugin catalog + plugin disclosures that the `/plugins` page consumes. This proposal does not touch that surface (the plugin cards/disclosures stay as-is). It only touches *non-plugin* pages.
- f00049 S7 (de-host i18n) overlaps in spirit (one shared strings layer) but addresses chrome strings (nav labels, hero CTAs). This proposal addresses content strings (page bodies). They complement, not duplicate.
