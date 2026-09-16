---
id: f00549
title: "Where a new file belongs, and which layers it may import"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-16
tags:
    - conventions
    - architecture
    - placement
    - layers
---

# f00549 — Where a new file belongs, and which layers it may import

## goal

Before creating a file, an agent can ask where it belongs and be told
the path, the role it will have, and which layers it may import from —
and a gate can say afterwards whether the answer was followed.

## why

`conventions` today answers half of this well. `classifyPath` maps any
repo-relative path to one of ~50 roles from a single rule table that
both `docs/delendai/FILE-CONVENTIONS.md` and the lint derive from, and
`conventions_check` reports per-role counts plus unmatched paths across
four language profiles. That is classification: given a path, name its
role.

The inverse is missing. An agent that has written a service and needs to
place it has no way to ask "where does this go?", and nothing states
which layers may depend on which. The repo enforces several such rules
today, but each lives in its own bespoke lint — `lint:cli-imports`,
`lint:no-internal-core-imports`, `lint:publication-boundary`,
`lint:plugin-physical-containment` — so the rules exist but there is no
one place that states them, and no way for an agent to ask before acting
rather than discover at push time.

Test support is the clearest symptom: `test-support` is already a role
in the classifier, yet what may import it, and from where, is written
down nowhere.

## non-goals

- **Not a new classifier.** `classifyPath` stays the single source of
  truth for roles; this adds placement and dependency rules on top.
- **Not a replacement for the boundary lints.** Those keep their
  verdicts. This states the rule they each enforce so it can be asked
  about, and flags where two disagree.
- **Not a reorganisation.** Declaring the rules does not move existing
  files; migration is a separate decision per f00547's principle
  that new code and existing code are different actions.

## slices

### S1 — Declare the layer graph the lints already enforce

- **Status**: done — six rules, each naming the lint that already
  enforces it: `no-node-imports-in-contracts` and
  `no-node-imports-in-state` (those packages stay pure TypeScript),
  `no-core-public-types-in-client` (types from `@delendai/core/contracts`,
  runtime from `/public`), `cli-imports` for both `packages/cli/src` and
  `tools/scripts` (core only through its public barrel), and
  `no-absolute-local-imports`. `layerOf` answers which layer a path is
  in, `rulesFor` what that layer may not import, and
  `findUnenforcedRules` reports any rule whose enforcer is missing. The
  spec feeds that last one the REAL `package.json`, so a rule that
  drifts away from its gate fails the suite instead of becoming
  folklore — which is the difference between a declaration and a
  comment.

  Two corrections to this slice, both found by the repo's own gates:

  - the spec now lives under `tests/`. The `Files:` list named
    `src/lib/layers/layer-graph.spec.ts`, but this plugin collects
    `tests/**/*.spec.ts` only, so a spec written there would never have
    run. The **Gate** line below already named the right path.
  - `layer-graph.ts` was UNMATCHED by `file-conventions`: the role table
    has no role for that basename. For a proposal about where files
    belong, that is worth saying out loud rather than quietly renaming.
    It is now `layer-graph.service.ts` (the `service` role matches
    `endsWithBasename(rel, 'service.ts')`), and the exported constants
    moved to `contracts/constants/layer-graph.constant.ts`, where
    `types-in-contracts` keeps them. That lint's debt drops 3406 -> 3396.
- **Files**: [`plugins/conventions/src/lib/layers/layer-graph.service.ts`, `plugins/conventions/src/lib/contracts/constants/layer-graph.constant.ts`, `plugins/conventions/src/lib/contracts/interfaces/layer-graph.interface.ts`, `plugins/conventions/tests/src/lib/layers/layer-graph.spec.ts`]

One declaration of which layer may import which, derived from the rules
already enforced in `tools/scripts/lint`. A plugin may not reach into
`tools/`; a package may not import another's internals; a CLI script
imports core through its public barrel. Where the declaration and an
existing lint disagree, the spec says so rather than papering over it.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/layers/layer-graph.spec.ts`

### S2 — `conventions_suggest_path`: where this belongs

- **Status**: done — `conventions_suggest_path` takes a role, a package
  and a name and answers with the path, where its spec goes, and the
  rules that apply: always dot and never hyphen, the `I` prefix on
  exported types, and the co-location rule for the role asked about.
  The answer is CHECKED before it is returned — the path goes back
  through `classifyPath`, and a disagreement between the placement
  table and the classifier is reported as an error naming both roles
  rather than answered confidently. 22 cases cover every role in the
  table, the slug forms (`layer graph`, `layerGraph`, `layer_graph`),
  the mirrored spec path, and both refusals.

  The placement table and the argument shape stay module-private: an
  exported type or constant in a `*.tool.ts` belongs in `contracts/`
  and would be a new `types-in-contracts` violation. Registering the
  builder in `lib/tools/index.ts` is part of this slice's work —
  `unregistered-tools` treats an unwired builder as a tool that does not
  exist — and that file is absent from `Files:` for the reason recorded
  in `67a6fca63`, so `auto_work` can still claim the slice.

  The spec path in `Files:` above is corrected: it named
  `src/lib/tools/suggest-path.tool.spec.ts`, but this plugin collects
  `tests/**/*.spec.ts` only, so that spec would never have run — the
  same defect S1 carried, and the **Gate** line already had it right.

  Cost: swarm 160,605 -> 161,396 B, 148 -> 149 tools. Recorded in the
  core cost pin with the delta attributed (147 B input schema, 383 B
  output schema, 261 B name/description/envelope); every preset stays
  within budget.
- **Files**: [`plugins/conventions/src/lib/tools/suggest-path.tool.ts`, `plugins/conventions/tests/src/lib/tools/suggest-path.tool.spec.ts`]

Given a role, a package and a name, answer with the path the classifier
will agree with — and with the co-location and naming rules that apply
(hyphen vs dot, the `I` prefix for exported types, where the spec goes).
The answer is checked by running `classifyPath` on it, so the tool can
never suggest a path its own classifier would call `other`.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/suggest-path.tool.spec.ts`

### S3 — `conventions_explain_path`: why this path, and what it may import

- **Status**: done — `conventions_explain_path` answers four things for a
  repo-relative path: the role, WHICH rule assigned it, the layer it
  sits in, and what that layer may not import — each import rule naming
  the `lint:*` script that enforces it, so a refusal at push time can be
  read before the edit.

  `classifyPath` returns the role but not the rule that produced it, so
  the tool walks the same exported `DEFAULT_TS_RULES` chain, first match
  wins. That is deliberately not a second classifier, and a table-driven
  case over seven path shapes pins that the walk and `classifyPath`
  never disagree — including `other`, where no rule is named rather than
  a wrong one invented. 13 cases in all, with the layer, the enforcers,
  the no-layer path and the empty-path refusal.

  It composes S1 rather than repeating it: `layerOf` and `rulesFor` are
  imported from the layer-graph service. Naming a local helper `rulesFor`
  is what `lint:no-duplicate-implementation` refused in S2, and importing
  the real one is the fix that lint asks for first.

  The spec path in `Files:` above is corrected — it named
  `src/lib/tools/explain-path.tool.spec.ts`, but this plugin collects
  `tests/**/*.spec.ts` only, so it would never have run. Third slice with
  the same defect; the **Gate** line had it right each time. Registering
  the builder in `lib/tools/index.ts` is part of this slice's work and is
  absent from `Files:` for the reason recorded in `67a6fca63`.

  Cost: swarm 161,396 -> 162,377 B, 149 -> 150 tools, recorded in the
  core cost pin with the delta attributed (77 B input schema, 628 B
  output schema, 276 B name/description/envelope). The output schema
  carries most of it because the answer is structured rather than a
  string.
- **Files**: [`plugins/conventions/src/lib/tools/explain-path.tool.ts`, `plugins/conventions/tests/src/lib/tools/explain-path.tool.spec.ts`]

Given a path, answer its role, the rule that assigned it, the layer it
sits in and what that layer may import — so a refusal at push time can
be understood before the edit instead of after.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/explain-path.tool.spec.ts`

### S4 — `conventions_check_architecture`: dependency drift as a report

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/tools/check-architecture.tool.ts`, `plugins/conventions/src/lib/tools/check-architecture.tool.spec.ts`]

Report imports that cross a declared layer edge, baselined so existing
debt is visible without blocking, and shrinking only. Read-only, like
every other tool this plugin ships. Registering it in the plugin's
existing `src/index.ts` is part of this slice's work; that file is not
listed above because a slice whose `Files:` mixes new paths with
already-tracked ones reads as half-done to `auto_work`, which then
refuses to claim it.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/check-architecture.tool.spec.ts && bun run lint:unregistered-tools`

**Measured before implementing (2026-09-17, develop at `53ec2500c`).**
Three findings that change this slice's shape, none of them visible from
the brief:

1. **S1's rules are prose, not matchers.** `ILayerRule.forbids` is a
   human sentence (`'any `node:*` builtin, and `@delendai/core`'`), so
   nothing here can compute a crossing from the graph as shipped. This
   slice must add an OPTIONAL machine-checkable companion beside the
   prose — the single consumer today is `explain_path`, which reads
   `forbids`/`enforcedBy`/`because`/`unenforced`, so an added optional
   field is safe. A rule with no matcher must be reported as
   unmatchable, never silently skipped.

2. **Every enforcing lint is green, but one of them is green for the
   wrong reason.** `no-core-public-types-in-client` reports 0 violations
   across 53 files and has no baseline — yet `packages/client/src`
   contains FOUR type-only imports from `@delendai/core/public`, which
   is exactly what that lint forbids:

       node/scaffold/project-plugins.ts:18
       node/scaffold/write-scaffolded-files.ts:21
       node/services/plugin-activation.service.ts:9
       lib/services/agent-catalog-service.ts:1

   The lint splits each file into lines and runs its regex per line,
   and that regex needs `import type { … } from '@delendai/core/public'`
   on ONE line. This repo's house style wraps imports across lines, so
   the rule is invisible to its own gate. The files ARE in the scanned
   set — the count it prints, 53, is every non-spec `.ts` under the
   root, `project-plugins.ts` included — so the gate read them and saw
   nothing.

   (An earlier note here claimed these four were false positives from a
   crude regex. That was wrong, and is corrected: the crude regex was
   right about the file set; the lint is what misses them. Recording the
   correction rather than quietly deleting it, because a proposal that
   silently revises its own measurements is the drift this plugin
   exists to make visible.)

   This strengthens the slice rather than weakening it: there ARE real
   crossings, they are simply unreported. The tool must still carry
   fixture specs proving it DETECTS a crossing on a synthetic tree, and
   must report its sample count — a report validated only by a green run
   against this repo would be the empty-surface green seen elsewhere.

3. **The matchers must reuse each lint's real semantics.** The
   type-vs-value distinction above is exactly what a hand-rolled regex
   gets wrong. A matcher that disagrees with the lint it cites makes
   this tool contradict the gate it claims to derive from.

Also: no plugin reads `tsconfig.base.json` today and core does not
expose the alias table, so resolving a specifier to a layer (137 exact +
70 wildcard aliases, all landing inside
`packages|plugins|apps|extensions|tools`) is new ground, and the reading
must go through this plugin's injected reader seam rather than
`node:fs`. The baseline is READ from an option and never written: every
baseline in this repo lives under `tools/scripts/lint`, and S1's own
layer graph forbids a plugin from reaching there.

### S5 — Write down what test support is allowed to be

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/layers/test-support-rules.ts`, `plugins/conventions/src/lib/layers/test-support-rules.spec.ts`]

State the rule the repo already lives by: fakes belong in the test-kit,
a spec may import test support, production code may not, and a fake that
two packages need belongs in `@delendai/test-kit` rather than being
copied. `lint:test-unsafe-casts` already pushes authors toward the kit;
this says where the kit's contents may be used from. Writing the rule
into the existing `docs/delendai/FILE-CONVENTIONS.md` is part of this
slice's work; that file is not listed above for the same reason as S4.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/layers/test-support-rules.spec.ts && bun run lint:file-conventions`

## acceptance

- `conventions_suggest_path` returns a path that `classifyPath` assigns
  the requested role, for every role the profile declares.
- `conventions_explain_path` names the layer and the permitted imports
  for any repo path.
- `conventions_check_architecture` reports the existing cross-layer
  imports as a baseline that may only shrink.
- Every rule the layer graph declares is one an existing lint already
  enforces, or is reported as a gap rather than silently invented.

## notes

- Presets matter for adoption: a host that is not a monorepo should get
  a smaller profile, the way `conventions_check` already takes `roots`
  and `profile`.
