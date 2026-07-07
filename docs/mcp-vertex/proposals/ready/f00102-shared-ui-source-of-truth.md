---
id: f00102
kind: refactor
status: ready
type: proposal
track: apps/shared+apps/web+extensions/vscode+tools/scripts
date: 2026-07-07
title: "Shared UI source of truth — one .ts / .scss pair per reusable component, consumed by site and editor"
shipped-in: []
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

## why

Two slices already landed the foundation:

1. `45f6d261` — BEM-nested SCSS for the dashboard / dev-wizard with
   shared tokens (`var(--mv-*)`) and a shared `@forward` index under
   `apps/shared/src/styles/`.
2. `f2cd385a` — the first host-agnostic component (Callout) with the
   `*.ts` (string builder) + `*.scss` (BEM rules) + Astro wrapper
   pattern, plus a `.ui-callout` `@extend` alias so the docs site
   keeps its existing 21 `.astro` pages unchanged.

The user followed up with two requirements on top of that foundation:

- "*se puede hacer que se haga todo con astro y al compilar se conjunte en la extension?*"
- "*que todos los proyectos que usen web, compartan estilos, componentes, y forma de funcionar… reutilizando codigo. Lo mismo creando una fuente que luego se empaquete con cada una.*"

Translation: one source, one renderer-pair (`*.ts` returning HTML +
`*.scss` carrying the BEM rules), every consumer imports the same
module. Astro's `renderToString` integration is a future option
(S5) — only worthwhile if/when authoring moves from `.ts` to `.astro`.

This proposal formalises the path that `f2cd385a` started.

## non-goals

- **No Astro renderToString in S2-S4.** The extension webviews
  receive a single HTML string at build/runtime; the existing
  `renderRuntime`/`renderDropdown`/`renderCallout` contract already
  produces a string. Rewriting components as `.astro` for the
  string-builder case is a stylistic preference that adds a dep on
  `astro:container` for zero functionality gain — keep it as S5
  optional, gated by team wish to write `.astro` not `.ts`.
- **No full rename of legacy `.ui-*` selectors.** The `@extend` alias
  keeps old markup working; we migrate page-by-page with the
  existing lint:style-integrity ratchet (f00099 S2).
- **No `import.meta.env.BASE_URL` in shared components.** Hosts
  compute the base and pass it as a prop. `Base.astro` keeps living
  in `apps/web` as the only place that resolves `BASE_URL`.

## architecture

For every shared component:

```
apps/shared/src/components/<area>/<name>.ts        ← renderFoo(props, ...): string
apps/shared/src/components/<area>/<name>.scss      ← BEM &-nested, mv-foo, --mv-* tokens + @extend .ui-foo alias
apps/web/src/components/<area>/<name>.astro       ← 6-line wrapper using Astro.slots.render('default')
```

Rules:

- `*.ts`: pure function, no DOM, no `import.meta.env`. Returns a single
  HTML string. Escapes user-inputed interpolated values.
- `*.scss`: BEM with `&`. Colors come from `var(--mv-*)` from
  `_tokens.scss` and `_themes.scss`. Trailing `@extend .mv-*` for
  legacy `.ui-*` selectors when the component had prior site markup.
- `*.astro`: thin wrapper, calls `Astro.slots.render('default')` and
  re-emits via `<Fragment set:html={...} />`.

Build pipeline unchanged: SCSS still compiles via the Bun.build plugin
from `tools/scripts/dev/dev.script.ts` (commit `45f6d261`).

## Slices

global_gate: validate

### S2.1 — `Tabs` → shared

- **Files**:
  - new `apps/shared/src/components/ui/tabs.{ts,scss}`
  - rewrite `apps/web/src/components/ui/Tabs.astro` as wrapper
- **Gate**: `bun run check` in apps/web, `bunx tsc --noEmit` repo-wide
- **Acceptance**: Every existing `<Tabs tabs=... defaultTab=... variant=...>`
  call site in `apps/web/src/pages/**/*.astro` keeps rendering identically.
  The 21 page spot-check is the same suite used by `lint:style-integrity`.

### S2.2 — `CodeBlock` → shared

- Same shape as S2.1.
- The copy button embedded in `<header>` is reused from `CopyButton`
  (which itself lands in S2.4). The two consumers of the copy
  behaviour stay in lockstep by both importing `renderCopyButton`.

### S2.3 — `Stepper` → shared

- Trivially struct-only. Same shape.

### S2.4 — `CopyButton` → shared

- The `<button data-copy-text>` consumer is the same `data-copy-text`
  the runtime glue already handles (see `renderRuntime` from
  `@mcp-vertex/shared`). The renderer just emits the markup; the
  bundle wires up the click handler via the runtime glue that the
  extension already injects.

### S3.x — Components with `import.meta.env` (BEM-only rewrite)

- **S3.1 — `PageHeader`**: lang + title + crumbs are already props.
  Move as-is.
- **S3.2 — `SiteFooter`**: replace `import.meta.env.BASE_URL` with a
  `baseHref` prop. `Base.astro` (the only caller) passes
  `import.meta.env.BASE_URL` in.
- **S3.3 — `SiteNav`**: same; baseHref + lang props. The dropdown
  inside continues to use the shared `renderDropdown` from
  `@mcp-vertex/shared` (already shipped).
- **S3.4 — `MarkdownPage`, `PluginPage`, `ToolPage`**: page-shaped,
  not pure components. Defer until after S3.3; only `MarkdownPage` is
  reused enough to justify a wrapper.

### S4 — `extensions/vscode` consumes shared components

- All four `render*Html()` paths in `extensions/vscode/src/dashboard/`
  and `extensions/vscode/src/dev/{welcome,settings-panel}.ts` reach
  for the shared `renderFoo(...)` instead of inlining their markup.
- The dev preview at :5200 stays on Bun.build; the bundle size should
  drop (shared SCSS gets deduped) and the visual surface becomes
  literally identical to the docs site.
- Add `tools/scripts/lint/shared-ui-ratchet.script.ts`: forbidden to
  inline `<aside class="ui-*`>` or `<nav class="ui-tabs">` markup
  inside `extensions/vscode/` — must import from shared.

### S5 (optional) — Astro renderToString integration

- Mirror each `*.ts` into a sibling `*.astro` and emit a frozen
  string per variant via `astro:container` at build time. The dev
  preview at :5200 then runs an Astro dev server on the same
  components, replacing `Bun.build + Bun.serve` for the dashboard
  routes.
- This slice is a **future** proposal. We start S2 immediately.
  S5 only ships if the team wants to author in `.astro` over `.ts`.

## acceptance

- `bunx tsc --noEmit -p tsconfig.json` → exit 0
- `apps/web` `bun run check` → exit 0
- `curl http://localhost:5200/__entry.js` → 200, **≤ 1.14 MB**, 0 cross-spawn
- Every component shipped from `apps/shared/src/components/` reaches at
  least 1 docs-site page and 1 extension webview (visible count).
- `lint:style-integrity` (f00099 S2) keeps passing after each slice.
- Bundle doesn't regress: BEM dedupes shared styles, so each new
  shared component removes duplicated CSS bytes from the extension
  bundle.
