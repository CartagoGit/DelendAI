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

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/layers/layer-graph.ts`, `plugins/conventions/src/lib/layers/layer-graph.spec.ts`, `plugins/conventions/src/lib/contracts/interfaces/layer-graph.interface.ts`]

One declaration of which layer may import which, derived from the rules
already enforced in `tools/scripts/lint`. A plugin may not reach into
`tools/`; a package may not import another's internals; a CLI script
imports core through its public barrel. Where the declaration and an
existing lint disagree, the spec says so rather than papering over it.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/layers/layer-graph.spec.ts`

### S2 — `conventions_suggest_path`: where this belongs

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/tools/suggest-path.tool.ts`, `plugins/conventions/src/lib/tools/suggest-path.tool.spec.ts`]

Given a role, a package and a name, answer with the path the classifier
will agree with — and with the co-location and naming rules that apply
(hyphen vs dot, the `I` prefix for exported types, where the spec goes).
The answer is checked by running `classifyPath` on it, so the tool can
never suggest a path its own classifier would call `other`.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/suggest-path.tool.spec.ts`

### S3 — `conventions_explain_path`: why this path, and what it may import

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/tools/explain-path.tool.ts`, `plugins/conventions/src/lib/tools/explain-path.tool.spec.ts`]

Given a path, answer its role, the rule that assigned it, the layer it
sits in and what that layer may import — so a refusal at push time can
be understood before the edit instead of after.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/explain-path.tool.spec.ts`

### S4 — `conventions_check_architecture`: dependency drift as a report

- **Status**: pending
- **Files**: [`plugins/conventions/src/lib/tools/check-architecture.tool.ts`, `plugins/conventions/src/lib/tools/check-architecture.tool.spec.ts`, `plugins/conventions/src/index.ts`]

Report imports that cross a declared layer edge, baselined so existing
debt is visible without blocking, and shrinking only. Read-only, like
every other tool this plugin ships.

- **Gate**: `npx vitest run plugins/conventions/tests/src/lib/tools/check-architecture.tool.spec.ts && bun run lint:unregistered-tools`

### S5 — Write down what test support is allowed to be

- **Status**: pending
- **Files**: [`docs/delendai/FILE-CONVENTIONS.md`, `plugins/conventions/src/lib/layers/test-support-rules.ts`, `plugins/conventions/src/lib/layers/test-support-rules.spec.ts`]

State the rule the repo already lives by: fakes belong in the test-kit,
a spec may import test support, production code may not, and a fake that
two packages need belongs in `@delendai/test-kit` rather than being
copied. `lint:test-unsafe-casts` already pushes authors toward the kit;
this says where the kit's contents may be used from.

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
