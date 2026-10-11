---
id: f00548
title: "Own the style surface: who may define a selector, and what breaks when it changes"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-16
tags:
    - styles
    - scss
    - impact
    - design-tokens
---

# f00548 — Own the style surface: who may define a selector, and what breaks when it changes

## goal

Before an agent edits a stylesheet, it can learn which selectors it is
allowed to define, which surfaces consume the one it is about to change,
and whether the value it is about to hard-code already exists as a
design token.

## why

Style edits are the easiest place in a codebase to break something far
away. A selector is defined in one file and consumed by pages nobody
opened; a hard-coded `#2563eb` silently forks a colour the project
already names; a component grows a second, forked stylesheet because an
agent did not know the first existed.

Two ratchets already cover part of this and must not be duplicated:

- `lint:style-integrity` (f00099) cross-checks DEFINED scss classes —
  parsed with nesting expansion and comma-list splitting over
  `apps/web/src/styles` and `apps/shared/src/styles` — against USED
  `class="…"` literals in `.astro` markup, with waivers in
  `style-integrity.waivers.json`.
- `lint:shared-ui-ratchet` (f00102) owns `delendai-*` and `ui-*` shared
  component classes: no consumer may inline a copy of shared markup or
  fork CSS for a shared class.

So markup↔stylesheet integrity EXISTS. What does not exist is ownership
(who may define this selector), impact (what consumes it), and design
tokens (is this literal already named). This proposal adds those three
and leaves the two ratchets as the authorities they already are.

## non-goals

- **Not a second integrity checker.** f00099 stays the authority for
  used-but-undefined classes; f00102 stays the authority for shared
  component classes.
- **Not a Tailwind migration.** delendai itself uses SCSS and has no
  Tailwind dependency anywhere — the Tailwind rules here are for HOST
  projects that use it, resolved through f00547, never assumed.
- **Not a visual regression suite.** Whether the rendered pixels changed
  is a different question from whether the selector's consumers did.

## slices

### S1 — A selector's owner, and who consumes it

- **Status**: review
- **Files**:
  - `plugins/style-convention/package.json`
  - `plugins/style-convention/tsconfig.json`
  - `plugins/style-convention/vitest.config.ts`
  - `plugins/style-convention/LICENSE`
  - `plugins/style-convention/src/lib/parse/style-sources.service.ts`
  - `plugins/style-convention/src/lib/parse/path-glob.helper.ts`
  - `plugins/style-convention/src/lib/contracts/interfaces/style-sources.interface.ts`
  - `plugins/style-convention/src/lib/contracts/interfaces/selector-graph.interface.ts`
  - `plugins/style-convention/src/lib/graph/selector-graph.service.ts`
  - `plugins/style-convention/tests/src/lib/graph/selector-graph.service.spec.ts`
  - `tools/scripts/lint/style-integrity.script.ts`
  - `tools/package.json`
  - `tsconfig.base.json`
  - `bun.lock`
- **Gate**: `npx vitest run --project style-convention`
- shipped-in: `b8e94ffcfeb8`, `efbf09506405`
- acceptance:
  - The graph holds every selector with the files that define it and the surfaces that use it; a markup file's own `<style>` block defines selectors for that file.
  - The parser is the integrity ratchet's own, moved here and imported by the ratchet, so the two cannot disagree about nesting or comma lists; the ratchet's verdict is unchanged (415 used classes against 541 defined, its 22 specs green).

### S2 — `style_impact`: what a change to this selector reaches

- **Status**: review
- **Files**:
  - `plugins/style-convention/src/lib/tools/style-impact.tool.ts`
  - `plugins/style-convention/src/lib/tools/style-envelope.helper.ts`
  - `plugins/style-convention/src/lib/profile/style-workspace.service.ts`
  - `plugins/style-convention/src/lib/contracts/interfaces/style-workspace.interface.ts`
  - `packages/core/tests/src/lib/e2e/style-convention-over-mcp.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/e2e/style-convention-over-mcp.spec.ts`
- shipped-in: `de74749fbd71`
- acceptance:
  - Given a selector, or a file, it answers where each selector is defined, every surface that uses it, and which of those are in another package than every file that defines it.
  - A selector nothing defines or uses is refused by name rather than answered as "no impact".

### S3 — `style_check`: ownership and hard-coded values

- **Status**: review
- **Files**:
  - `plugins/style-convention/src/lib/check/style-check.service.ts`
  - `plugins/style-convention/src/lib/tools/style-check.tool.ts`
  - `plugins/style-convention/tests/src/lib/check/style-check.service.spec.ts`
- **Gate**: `npx vitest run --project style-convention`
- shipped-in: `efbf09506405`, `de74749fbd71`
- acceptance:
  - It refuses, with the reason and the remedy named: a selector whose prefix another layer owns, a second definition of a selector defined in another file, and a hard-coded value an existing design token names — and it names the token.
  - A class under a prefix another gate owns is not decided here: the finding names that gate (`sharedAuthority`), which in this repository is `lint:shared-ui-ratchet`.
  - It checks the file on disk or the stylesheet as it would be saved.

### S4 — `style_profile`: the project's declared style architecture

- **Status**: review
- **Files**:
  - `plugins/style-convention/src/index.ts`
  - `plugins/style-convention/src/public/index.ts`
  - `plugins/style-convention/plugin.manifest.ts`
  - `plugins/style-convention/README.md`
  - `plugins/style-convention/src/lib/contracts/constants/style-profile.constant.ts`
  - `plugins/style-convention/src/lib/contracts/constants/token-budget.constant.ts`
  - `plugins/style-convention/src/lib/contracts/schemas/style-options.schema.ts`
  - `plugins/style-convention/src/lib/profile/style-profile.service.ts`
  - `plugins/style-convention/src/lib/tools/style-profile.tool.ts`
  - `plugins/style-convention/tests/src/lib/profile/style-profile.service.spec.ts`
  - `apps/web/public/logos/plugin-style-convention.svg`
  - `tools/scripts/release/release-plan.ts`
  - `README.md`
- **Gate**: `npx vitest run --project style-convention`
- shipped-in: `efbf09506405`, `de74749fbd71`
- acceptance:
  - The architecture is declared once — `scss-bem`, `css-modules`, `tailwind`, `legacy-global` — with folder overrides (the last match wins), and `style_profile` says what applies to one path.
  - A folder declared `legacy-global` gets no finding from `style_check`.
  - Under `tailwind`, a directive the installed major does not accept (`@utility` on 3, `@tailwind` on 4) is refused; with no version installed, or a directive the table does not know, nothing is said.
  - A project that declares no `styleRoots` gets no tool and no diagnostic.

Re-cut at delivery: the installed version of the utility framework is read from the project's own manifest by this plugin. The plan sent it through f00547, whose public surface holds knowledge records and no version resolver; a directive table of ten lines did not justify adding one there.

## acceptance

- `style_impact` on a shared selector names every consuming surface,
  including across packages.
- `style_check` refuses a hard-coded value that an existing design token
  names, and names the token.
- A project declaring `legacy-global` for one folder gets no drift
  findings for that folder.
- `lint:style-integrity` and `lint:shared-ui-ratchet` keep their current
  verdicts unchanged; neither is re-implemented.

## notes

- "Design tokens" here always means the CSS/SCSS variable kind. In this
  repo "tokens" otherwise means LLM token budgets (`tokens:gate`,
  `docs/delendai/TOKEN-BUDGETS.md`), and the two must never be confused
  in tool names or output.
