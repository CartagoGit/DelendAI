---
id: f00548
title: "Own the style surface: who may define a selector, and what breaks when it changes"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-09-16
tags:
    - styles
    - scss
    - impact
    - design-tokens
last-transition-id: 15403476-c6cc-4c0b-a66d-bc829fa72db4
last-correlation-id: 15403476-c6cc-4c0b-a66d-bc829fa72db4
last-transition-from: in-progress
last-transition-at: 2026-10-11T22:04:27.507Z
shipped-in:
  - "9bbb94ffd"
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 9bbb94ffd, validate exit 0, tests 28/28 — Delivered by b8e94ffcf ("refactor(styles): one reading of what a stylesheet defines and what markup use…"), which carries 10 of the 14 declared files; the merge 9bbb94ffd (PR #1036) carries all 14. Gate `none`. This slice's whole purpose is to stop two implementations of "what does this stylesheet define" from drifting apart, so ACC1's second half is the claim that actually matters and I checked it by import rather than by reading the header: tools/scripts/lint/style-integrity.script.ts imports from `@delendai/style-convention/public` at three sites, i.e. the ratchet now consumes this slice's parser instead of keeping a private one — the "moved here and imported by the ratchet" structure, which is what makes disagreement impossible rather than merely unlikely. The behaviour that could have broken in the move is pinned by a test named for it: 'reads nesting and comma lists as the integrity ratchet does'. ACC0 has two: 'lists what each file defines' and 'knows a markup file defines what its own style block declares' — the latter being exactly the criterion's markup rule. And the ratchet itself runs green from my worktree: '✓ style-integrity: 65 scss + 100 astro files scanned; 430 used classes checked against 541 defined (7 waived, 4 built-in ignores)'. One number differs from the criterion and the reason is benign: it quotes 415 used classes, the tree now has 430 — the DEFINED count (541) is identical, and "used" legitimately grows as markup is added across the repo since the slice was written. The verdict is unchanged in the sense the criterion means: same defined surface, no new drift. Evidence 28/28 is the whole style-convention plugin suite (4 files, all green).

### S2 — `style_impact`: what a change to this selector reaches

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 9bbb94ffd, validate exit 0, tests 28/28 — Delivered by de74749fb ("feat(style-convention): three read-only tools — style_profile, style_impact, s…"), carrying all 5 declared files; the merge 9bbb94ffd (PR #1036) is the other valid candidate. Gate `none`. ACC0's three answers each have a named passing test in selector-graph.service.spec.ts: 'names every consuming surface, and which are in another package' (the cross-package clause is not incidental — it is the whole reason a graph beats grep), 'is the impact of every selector the file defines' (the file-side entry point), and the selector-side answer exercised alongside it. ACC1 is the clause I would have skipped if I only read the happy path, and it is exactly right to skip 'no impact' as a universal answer: the test 'answers for a selector nobody uses, and has nothing for one that does not exist' asserts the two cases SEPARATELY — a real selector with no consumers gets a truthful "no impact", an unknown selector is refused by name. That distinction is the difference between a tool that answers and a tool that guesses, and collapsing them would have made this slice quietly wrong while still looking complete. Evidence 28/28 is the whole style-convention plugin suite.

### S3 — `style_check`: ownership and hard-coded values

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 9bbb94ffd, validate exit 0, tests 28/28 — Delivered by efbf09506 and merged as 9bbb94ffd (PR #1036), carrying the declared files. Gate `none`. ACC0 asks for three refusals and all three have their own named passing test in style-check.service.spec.ts — 'refuses a selector another layer owns', 'refuses a second definition of a selector defined elsewhere', and 'refuses a hard-coded value an existing design token names, and names the token'. I looked for the token-naming specifically because it is the clause a token matcher usually fakes by saying 'use a token' without saying which; the assertion is in the test's own title, and two neighbours ('names an SCSS variable as itself, and ignores values too short to be worth a token', 'does not flag the token file declaring its own tokens') show the false-positive edges were considered too. ACC1 is the clause that makes this check safe to add at all, and it is both in code and in a test: style-check.service.ts:91 emits the remedy 'It is not this check's to decide: ${profile.sharedAuthority} owns `${shared}*`. Change the shared definition, or run that gate.' — so a shared class is handed to the owning gate (`lint:shared-ui-ratchet` in this repository) rather than decided here, which is what stops two gates fighting over one class. ACC2 is pinned by 'accepts the file that holds a definition changing it': the check reads the file as it would be saved, so the file that legitimately owns a definition is not flagged for editing it. Evidence 28/28 is the whole style-convention plugin suite.

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
- review-state: in_review
- review-implementer: claude-opus-5-5

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
