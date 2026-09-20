---
id: x00563
title: "The shape of a work ref is stated once"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - contracts
    - naming
---

# x00563 — The shape of a work ref is stated once

## goal

A work ref reads the way the convention describes it, and the convention
exists in exactly one place that everything else composes from.

## why

The documented convention is:

```
{namespace}/{wip|pr}/{model}/{proposal}-{slice}-g{generation}/{what it is}
```

Two things were wrong with what shipped.

**The explanation was not its own component.** The template joined it
with a dash, so a ref read
`delendai/wip/claude-opus-5/x00035-S11-g1-docs-cross-ide-addendum-ide-extension-v3-section`
— a 90-character run in which a Git client cannot tell the unit of work
from its description. With the explanation as its own path component, a
client groups the work and shows the description under it.

**The shape existed twice.** `profiles.ts` declared it, and `resolve.ts`
re-spelled it to compose the namespace prefix. They agreed by luck until
one changed: setting `namespacePrefix` silently produced the OTHER
shape, and nothing compared them. That is the same defect class as
x00560 — a convention with two sources of truth is a convention that
drifts — and it is why the first attempt at this change appeared to do
nothing in a project that sets a prefix.

## non-goals

- **No renaming of existing refs.** Refs written under the dash shape
  keep their names; rewriting somebody's ref is the trade this project
  refuses.
- **No new glob or template engine.** The template syntax is unchanged;
  only where the default lives and which separator precedes the topic.

## slices

### S1 — One shape, composed by everything that needs a namespace

- **Status**: done — `WORK_REF_SHAPE` states the part after the
  namespace once; the profile and the namespace-composing resolver both
  build from it, so a project that sets a prefix gets the same shape as
  one that does not.
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`,
  `packages/core/src/lib/development-policy/profiles.ts`,
  `packages/core/src/lib/development-policy/resolve.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`

### S2 — A ref written under the old shape still attributes

- **Status**: done — the reader accepts EITHER separator before the
  topic, and a missing topic as before. Changing a template must never
  turn a machine's existing work into `unattributable` and boot it
  DEGRADED over refs that were never wrong.
- **Files**: `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`,
  `packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`

## acceptance

- A work ref renders as
  `<ns>/wip/<model>/<proposal>-<slice>-g<n>/<explanation>`, with the
  explanation as its own component, and parses back to the same identity.
- A project that sets `namespacePrefix` gets that same shape.
- A ref written under the dash shape still parses to its owner, its
  proposal, its slice, its generation and its topic.
