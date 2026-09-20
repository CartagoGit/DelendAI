---
id: x00568
title: "A publication keeps the name of the work it publishes"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - naming
    - contracts
---

# x00568 — A publication keeps the name of the work it publishes

## goal

A `pr/` ref and the `wip/` ref it came from carry the same name, because
the publication ref is derived from the work ref rather than spelled by
whoever is publishing.

## why

x00563 established that the shape of a work ref is stated once, in
`WORK_REF_SHAPE`. It stated it for **half** the namespace. `profiles.ts`
composes `workRefTemplate` from that constant; publication got only a
prefix — `publicationRefPrefix: 'pr/'` — and no shape at all.

What goes after the prefix was therefore a free-text argument,
`work publish --as=<name>`. And a free-text argument spelled by an agent
is not a convention; it is a suggestion. The evidence is the namespace
itself. Every work ref in this repository is canonical:

```
delendai/wip/claude-opus-5/x00566-S1-g1/hooks-run-in-every-worktree
```

and every publication ref is flat:

```
delendai/pr/x00566-guards-run-in-every-worktree
```

No agent, model or generation in any of them — six of six, made by a
process that had the canon written down and a command that did not
enforce it. This is the failure mode the whole cycle keeps rediscovering:
a rule that lives in prose and a code path that lets the model choose.

A publication is not a new thing needing a new name. It is the same unit
of work, published. Deriving the name makes that true in the only place
it matters.

## non-goals

- Changing `WORK_REF_SHAPE`. The shape is right; it was only half
  applied.
- Renaming the publication prefix, or the namespace. `publicationRefPrefix`
  stays configurable, and the derivation reads it rather than assuming
  `pr/`.
- Reaping or renaming the refs already published under the old flat
  names. They are live pull requests; see **notes**.

## architecture

`publicationRefFromWorkRef(policy, workRef)` takes the work ref, strips
the policy's `workRefPrefix`, and re-attaches the policy's
`publicationRefPrefix`. Everything between — agent, proposal, slice,
generation, topic — is carried across untouched, so the two refs differ
in exactly one segment and the shape has exactly one source.

`work publish` calls it instead of `publicationRefFor(policy, as)`, and
**refuses `--as=`** rather than ignoring it: a flag that silently stops
working teaches nothing, and the refusal says where the name now comes
from. A work ref outside the policy's prefix is refused too — there is no
name to keep, and inventing one is the behaviour being removed.

## slices

### S1 — the publication ref is derived, not chosen

- **Status**: review
- **Files**: [`packages/cli/src/lib/work-publish.service.ts`, `packages/cli/src/lib/work-publish.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts packages/cli/src/commands/work.command.spec.ts`

### S2 — the forge lets the canonical publication ref exist

- **Status**: review
- **Files**: [`tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/governance/forge-settings.lib.spec.ts`

## acceptance

- `publicationRefFromWorkRef` maps
  `…/wip/claude-opus-5/x00568-S1-g1/a-topic` to
  `…/pr/claude-opus-5/x00568-S1-g1/a-topic`, under whatever namespace the
  project configured — not a hard-coded `delendai`.
- A ref outside the work-ref prefix yields `undefined`, and the command
  refuses it by name.
- `work publish --as=…` is refused, and the refusal says the name is
  derived.
- Publishing through the command puts the derived canonical ref on a real
  remote — asserted against the ref, not against a substring.

## risks and mitigations

- **A caller depended on `--as=`.** It is refused loudly rather than
  ignored, so the breakage is a message naming the replacement instead of
  a ref appearing under an unexpected name.

## notes

The forge half turned out to be **in** the repository after all, and
that is the more interesting finding. `namespaceRuleset()` in
`tools/scripts/governance/forge-settings.lib.ts` already derives the
ruleset from the policy, and `lint:namespace-ruleset` already refuses a
forge that stopped matching it — the mechanism ADR 0020 asked for was
built and working.

It was the *derivation* that carried the bug, in one line: the work ref
namespace was projected as `**/*` and the publication namespace as `**`,
and `**` matches a single segment. So the forge declined every canonical
publication ref —

```
remote: - Cannot create ref due to creations being restricted.
```

— and the only names it would accept were flat ones. The canon was
genuinely single-sourced; the single source said the wrong thing for
half the namespace, which is why nobody caught it by reading the config.

S2 gives the two namespaces the same depth, and a spec now asserts that
the publication pattern is the work pattern with `wip` swapped for `pr`,
so they can never drift apart again. The live ruleset was brought back
into agreement with `namespace-ruleset-guard --sync`, which is the
sanctioned path — no hand-edited JSON.

### the original diagnosis, kept for the record

Before S2 it looked like the ruleset was a third, hand-written copy:

```
refs/heads/delendai/wip/**/*    ← matches the deep, canonical shape
refs/heads/delendai/pr/**       ← matches ONE segment only
```

Pushing a canonical publication ref is refused by the forge today:

```
remote: - Cannot create ref due to creations being restricted.
```

So the flat `pr/` names were not only allowed by the command — they were
the only names the remote would accept. The ruleset needs
`refs/heads/delendai/pr/**/*` added, mirroring the `wip/` pattern. That
is an administrative write, and the bootstrap credential currently
answers `401 Bad credentials`; it was not attempted by any other route.

The durable fix is to stop hand-writing that third copy: the forge
already models a desired state (`IDesiredForgeState` / `ILiveForgeState`),
and the ruleset's ref patterns should be **derived from the policy** the
same way the templates are, so the startup reconciler reports the drift
instead of an agent discovering it by being refused a push. That is S2,
and it is deliberately not bundled here.
