---
id: x00576
title: "Every generated file merges the same way"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - git
---

# x00576 — Every generated file merges the same way

## goal

No pair of candidates can conflict on a file neither of them authored.

## why

x00574 established that the generated merge driver was declared and never
installed. Installing it fixes the files it is declared for — and it is
declared for **three**.

`gen:all` has six generators. Their outputs, against what
`.gitattributes` routes:

| generator | outputs | routed |
| --- | --- | --- |
| agent-catalog | catalog + host-hints | ✅ |
| gen:quantitative | the AGENT-BOOTSTRAP block | ✅ |
| agent-md | **68** `AGENT.md` | ❌ |
| plugin-manifests | manifests, plugin catalog, permission matrix, the per-plugin documents, two web catalogs | ❌ |
| capability-matrix | the capability matrix | ❌ |
| token-budget-dashboard | measured, has its own gate | n/a |

Every one of the unrouted files is a projection of **all** plugins or
**all** workspaces at once. So a candidate touching one plugin rewrites
the file that describes the others, and two candidates touching two
different plugins conflict on documents neither of them wrote — the same
stall as before, waiting for the next pair of plugin changes.

The declaration and the driver's own rule table were also two lists
maintained by hand, which is how three became three and stayed there
while the generators grew to six.

## non-goals

- Generating fewer files, or committing fewer of them. That is a
  separate trade.
- Routing anything a person authors. The bar stays what the rule table
  already states: *its content is a function of the tree, and a generator
  proves it.*

## architecture

Three rules join the table, each naming the command that regenerates its
paths: `gen:agent-md`, `generate:from-manifests`,
`generate:capability-matrix`. The matcher gains directory support — a
candidate ending in `/` covers everything beneath it — so the 68
per-workspace documents are named once rather than 68 times.

And the two lists are pinned to each other by a spec that reads the real
`.gitattributes`: every routed path must have a rule, and every rule's
path must be routed. A rule with no attribute is a generator that will
never be asked; an attribute with no rule makes git call the driver for a
file it cannot regenerate. Both are now failures, in both directions.

## slices

### S1 — every generator's output is routed, and the two lists are pinned together

- **Status**: review
- **Files**: [`tools/scripts/git/generated-merge-driver.constant.ts`, `tools/scripts/git/generated-merge-driver.script.ts`, `tools/scripts/git/generated-merge-driver.script.spec.ts`, `.gitattributes`]
- **Gate**: `npx vitest run tools/scripts/git/generated-merge-driver.script.spec.ts`

## acceptance

- `.gitattributes` routes every path the rule table knows how to
  regenerate, and the table knows how to regenerate every path routed.
- `AGENT.md` resolves to `gen:agent-md` from any workspace.
- A file under a routed directory resolves to that directory's command.
- An authored file resolves to no rule at all.

## risks and mitigations

- **A generated file gets regenerated over a human edit.** Only paths
  whose content a generator proves are listed, and `drift` already fails
  when any of them differs from what its generator produces — so an edit
  to one of these was never going to survive a push anyway.
- **A new generator is added and not routed.** The spec fails the moment
  its output is declared and not ruled, or ruled and not declared. It
  cannot catch a generator whose output is neither, which is the same
  gap `drift` has and is worth its own slice.
