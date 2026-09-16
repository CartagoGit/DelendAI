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

- **Status**: pending
- **Files**: [`plugins/style-convention/src/lib/graph/selector-graph.ts`, `plugins/style-convention/src/lib/graph/selector-graph.spec.ts`, `plugins/style-convention/src/lib/contracts/interfaces/selector-graph.interface.ts`]

Build the graph the existing ratchets already half-walk: every selector,
the file that defines it, and every markup surface that uses it. The
scss parsing rules follow f00099's parser exactly — same nesting
expansion, same comma-list splitting — so the two never disagree about
what a stylesheet defines.

- **Gate**: `npx vitest run plugins/style-convention/tests/src/lib/graph/selector-graph.spec.ts`

### S2 — `style_impact`: what a change to this selector reaches

- **Status**: pending
- **Files**: [`plugins/style-convention/src/lib/tools/style-impact.tool.ts`, `plugins/style-convention/src/lib/tools/style-impact.tool.spec.ts`]

Given a selector or a file, answer which components, pages and shared
surfaces consume it, and which of those cross a package boundary. An
agent asked to restyle one page learns, before editing, that the
selector is shared with two others.

- **Gate**: `npx vitest run plugins/style-convention/tests/src/lib/tools/style-impact.tool.spec.ts`

### S3 — `style_check`: ownership and hard-coded values

- **Status**: pending
- **Files**: [`plugins/style-convention/src/lib/tools/style-check.tool.ts`, `plugins/style-convention/src/lib/tools/style-check.tool.spec.ts`]

Refuse, with the reason named: defining a selector another layer owns,
forking a shared block, and hard-coding a literal that an existing
design token already names. Delegates to f00102 rather than re-deciding
for `delendai-*` classes.

- **Gate**: `npx vitest run plugins/style-convention/tests/src/lib/tools/style-check.tool.spec.ts`

### S4 — `style_profile`: the project's declared style architecture

- **Status**: pending
- **Files**: [`plugins/style-convention/src/index.ts`, `plugins/style-convention/src/lib/profile/style-profile.ts`, `plugins/style-convention/src/lib/profile/style-profile.spec.ts`]

Declare the architecture once — scss-bem, css-modules, tailwind,
legacy-global — per scope, with folder overrides so `src/legacy/**` is
not "fixed" by an agent that mistook it for drift. Tailwind specifics
(`@apply`, `@utility`, `@reference`) resolve through f00547 against
the installed version, so an unsupported directive is refused rather
than emitted.

- **Gate**: `npx vitest run plugins/style-convention/tests/src/lib/profile/style-profile.spec.ts && bun run lint:unregistered-tools`

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
