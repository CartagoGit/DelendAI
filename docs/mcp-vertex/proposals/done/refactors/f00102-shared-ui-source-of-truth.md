---
id: f00102
kind: refactor
status: done
type: proposal
track: apps/shared+apps/web+extensions/vscode+tools/scripts
date: 2026-07-07
closed: 2026-07-08
title: "Shared UI source of truth — one .ts / .scss pair per reusable component, consumed by site and editor"
shipped-in:
    - fac9f4c9 # S2.1 Tabs
    - 2560538c # S2.2 CodeBlock
    - aafb3070 # S2.3 Stepper
    - dbcb9bd4 # S2.4 CopyButton
    - d057aa6e # S3.1 PageHeader
    - f02d2f76 # S3.2 SiteFooter
    - 512271e0 # S3.3 SiteNav → renderBrandMark + renderDrawer
    - 1261b07e # S4-ratchet (lint)
    - 3d07f91e # S4-real-extract (tabs shared with extension)
    - e7b7b0b2 # S4.5 theme + lang picker
    - de383af3 # S4.6 welcome + setup-wizard
recan: []
related:
    - 45f6d261 # refactor(styles): extract dashboard + dev-wizard CSS to BEM-nested SCSS
    - f2cd385a # refactor(ui): extract <Callout> to shared/components for host-agnostic reuse
    - c00002   # npm publish gate — aesthetics must be 100% consistent across surfaces
ownership:
    - { agent: implementation_runner, task: 'S2.1: move Tabs' }
    - { agent: implementation_runner, task: 'S2.2: move CodeBlock' }
    - { agent: implementation_runner, task: 'S2.3: move Stepper' }
    - { agent: implementation_runner, task: 'S2.4: move CopyButton' }
    - { agent: implementation_runner, task: 'S3.x: move PageHeader / SiteFooter / SiteNav' }
    - { agent: implementation_runner, task: 'S4: extensions/vscode consumes shared components' }
    - { agent: implementation_runner, task: 'S5 (optional): Astro renderToString via astro:container' }
globalGate: validate
acceptance:
    - { command: bunx tsc --noEmit -p tsconfig.json, expect: exit0 }
    - { command: bun run check (in apps/web), expect: exit0 }
    - { command: curl -s -o /dev/null -w '%{http_code}' http://localhost:5200/__entry.js, expect: '200' }
    - { command: grep -c cross-spawn /tmp/b.js, expect: '0' }
---

# f00102 — Shared UI source of truth

## goal

Make every reusable UI primitive (Callout, Tabs, CodeBlock, Stepper,
CopyButton, SiteFooter, SiteNav, PageHeader) live **once** in
`apps/shared/src/components/`, so the docs site (Astro), the VS Code
extension webview (string HTML), and any future product surface all
consume the same HTML strings and the same BEM styles. The visual
surface stays 100% consistent across surfaces; no surface can drift.

## outcome

**12 shared primitives** now live in `apps/shared/src/components/`,
each as a `.ts` (string renderer) + `.scss` (BEM rules) + optional
Astro wrapper:

| Primitive | Module | BEM namespace | Used by |
|---|---|---|---|
| `renderCallout` | `ui/callout` | `mv-callout` | docs site |
| `renderTabs` | `ui/tabs` | `mv-tabs` | docs site + dashboard |
| `renderCodeBlock` | `ui/code-block` | `mv-code` | docs site |
| `renderStepper` | `ui/stepper` | `mv-stepper` | docs site |
| `renderCopyButton` | `ui/copy-button` | `mv-copybtn` | docs site |
| `renderPageHeader` | `ui/page-header` | `mv-page-header` | docs site |
| `renderSiteFooter` | `ui/site-footer` | `mv-sitefoot` | docs site |
| `renderBrandMark` | `ui/brand-mark` | `mv-brand` | docs site + future surface |
| `renderDrawer` | `ui/drawer` | `mv-drawer` | docs site + future surface |
| `renderThemePicker` | `dev/theme-picker` | `mv-theme-picker` | extension dev preview + future CLI init wizard |
| `renderLangPicker` | `dev/lang-picker` | `mv-lang-picker` | extension dev preview + future CLI init wizard |
| `renderFirstRunScreen` / `renderQuickStartMenu` | `dev/welcome` | `mv-welcome` / `mv-quickstart` | extension dev preview + future surface |
| `renderSetupWizard` / `renderStatusBanner` | `dev/setup-wizard` | `mv-setup` / `mv-status-banner` | extension dev preview + future CLI init |

The `shared-ui-ratchet.script.ts` lint enforces "no inline forks of
shared BEM classes outside the shared source tree" and is wired into
`bun run validate` (3 waivers initially; **0 waivers as of S4-real-extract
+ S4.6**).

## shipped slices

global_gate: validate
status: done (S2.x, S3.x, S4-ratchet, S4-real-extract, S4.5, S4.6 all green)

### S2.1 — Tabs → shared — `fac9f4c9`

- new `apps/shared/src/components/ui/tabs.{ts,scss}`
- rewrite `apps/web/src/components/ui/Tabs.astro` as wrapper
- status: done

### S2.2 — CodeBlock → shared — `2560538c`

- Same shape as S2.1; copy button reused from `CopyButton` (S2.4).
- status: done

### S2.3 — Stepper → shared — `aafb3070`

- Trivially struct-only. Same shape.
- status: done

### S2.4 — CopyButton → shared — `dbcb9bd4`

- Emits `<button data-copy-text>`; runtime glue handles click.
- status: done

### S3.1 — PageHeader → shared — `d057aa6e`

- lang + title + crumbs are already props. Moved as-is.
- status: done

### S3.2 — SiteFooter → shared — `f02d2f76`

- Replaced `import.meta.env.BASE_URL` with a `baseHref` prop.
- `Base.astro` (the only caller) passes `import.meta.env.BASE_URL` in.
- status: done

### S3.3 — SiteNav → shared — `512271e0`

- The nav itself is site-specific (links + dropdown), but the
  `renderBrandMark` (logo + brand text link) and `renderDrawer`
  (mobile slide-in panel) were extracted as shared primitives
  because any future product surface (extension mobile sheets,
  CLI init menu, marketing-site hamburger) wants the same
  chrome. The Astro wrapper composes both.
- status: done

### S3.4 — `MarkdownPage`, `PluginPage`, `ToolPage` — deferred

- Page-shaped, not pure components. Future slice.

### S4 — extensions/vscode consumes shared components

- The IDE dashboard was the only consumer with its own inline tab
  markup. The shared `renderTabs` now serves both `apps/web` and
  the extension, and `renderThemePicker` / `renderLangPicker` /
  `renderFirstRunScreen` / `renderQuickStartMenu` /
  `renderSetupWizard` / `renderStatusBanner` were extracted from
  the extension's dev preview so the dashboard, settings, and
  welcome views all share the same chrome primitives.
- The dev preview at :5200 stays on `Bun.build + Bun.serve`; the
  bundle size stays under 1.15 MB with 0 cross-spawn and
  cross-surface CSS dedup via shared SCSS `@forward`.
- `tools/scripts/lint/shared-ui-ratchet.script.ts` (S4-ratchet)
  forbids inline `mv-*` BEM classes outside the shared source
  tree; `*.spec.ts` are exempt because the literals are the
  contract being pinned.
- status: done

### S5 (optional) — Astro renderToString via `astro:container`

- Authoring in `.astro` instead of `.ts` is a stylistic preference
  that adds a dep on `astro:container` for zero functionality
  gain. The dev preview at :5200 already renders the same
  HTML strings as the docs site (because both consume the same
  shared renderers); the only thing S5 would change is the dev
  server (Astro dev server vs. `Bun.serve`).
- Decision: **defer indefinitely**. The team can revisit if a
  product surface wants to author in `.astro` and the cost of
  mirroring every `*.ts` into a sibling `*.astro` becomes
  worthwhile. For now, the 737-line `tools/scripts/dev/dev.script.ts`
  is the canonical dev server and is the only consumer of
  `Bun.build + Bun.serve`.

## acceptance — final state on develop HEAD

- `bunx tsc --noEmit -p tsconfig.json` → exit 0 ✅
- `apps/web` `bun run check` → 0 errors, 0 warnings, 4 hints ✅
- `curl http://localhost:5200/__entry.js` → 200, 1.15 MB, 0 cross-spawn ✅
- `bun run lint:scss` → clean ✅
- `bun run lint:shared-ui-ratchet` → **0 violations** ✅
- `bun run test` → **4040 tests across 473 files, all passing** ✅

## why we stopped at S4.6

The remaining dashboard internals (`build-header`, `build-kpi-strip`,
`build-footer`, and the 9 `render-panel-*.ts` files) are not
"shared" — they are 100% the IDE dashboard's data visualisation,
with no consumer outside the extension. Extracting them would be
re-arranging chairs; the **ratchet** is the right tool to make
sure that any future surface that needs a panel reuses the shared
patterns instead of forking.

If a new product surface (a CLI `mcp-vertex init` wizard, a
JetBrains extension settings panel, a marketing-site onboarding
flow) needs the chrome primitives, they are already in
`@mcp-vertex/shared/components/dev/` ready to import.
