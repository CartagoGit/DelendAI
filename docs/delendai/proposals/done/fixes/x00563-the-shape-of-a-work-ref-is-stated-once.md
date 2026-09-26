---
id: x00563
title: "The shape of a work ref is stated once"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - contracts
    - naming
shipped-in:
  - 0a323aecb626f454c2c1c1d46d517074ef24557e
  - eb42953c666c85079d3dc99ae02cc224a4f5d542
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

- **Status**: done
  namespace once; the profile and the namespace-composing resolver both
  build from it, so a project that sets a prefix gets the same shape as
  one that does not.
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`,
  `packages/core/src/lib/development-policy/profiles.ts`,
  `packages/core/src/lib/development-policy/resolve.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge eb42953c6 (S3's delivery); S1 traces to 0a323aecb, full message read. Verified against acceptance: (1) the shape is stated ONCE — the defect was two sources (profiles.ts declared it, resolve.ts re-spelled it to compose the namespace prefix, agreeing by luck); WORK_REF_SHAPE in profiles.constant.ts is now the single statement and resolve composes from it, so setting namespacePrefix yields the SAME shape — the same defect class x00560 closed, named in the commit itself; (2) the explanation became its own component: a ref renders <ns>/wip/<model>/<proposal>-<slice>-g<n>/<explanation> instead of a 90-character run a Git client cannot parse; (3) round-trip parse-back to the same identity is pinned by work-ref-topic.spec.ts; EMPIRICAL: every live ref in this repo's swarm right now carries that exact shape (delendai/wip/qwen-3.8-max/f00394-close-g1/work, delendai/wip/claude-opus-5-5/f00536-S4-g1/the-frugality-rules-are-stated); (4) gate run verbatim: work-ref-topic.spec.ts + git-guard.spec.ts = 35/35 exit 0 (the S2-named startup-reconciler zone was also run: 89/89). bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered 0a323aecb626f454c2c1c1d46d517074ef24557e: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — A ref written under the old shape still attributes

- **Status**: done
  topic, and a missing topic as before. Changing a template must never
  turn a machine's existing work into `unattributable` and boot it
  DEGRADED over refs that were never wrong.
- **Files**: `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`,
  `packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. S2 landed with S1 in 0a323aecb ('The reader accepts either separator before the topic'), verified in the current tree: (1) work-ref-identity.ts lines 141-148 make the topic AND its preceding separator optional on read, accepting EITHER separator — every ref written before the template carried a topic still attributes instead of booting a machine DEGRADED over refs that were never wrong; (2) acceptance item 'a ref written under the dash shape still parses to its owner, proposal, slice, generation and topic' is pinned verbatim by work-ref-topic.spec.ts:114 ('still attributes a ref written under the dash shape', asserting topic 'the-old-dash-shape' from a dash-shaped ref); (3) the reader/writer asymmetry is deliberate and sound: tolerant READ, strict WRITE (S3); (4) gate run verbatim: npx vitest run packages/core/tests/src/lib/startup-reconciler = 89/89, 13 files, exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: unrecorded — nothing in Git names who delivered 0a323aecb626f454c2c1c1d46d517074ef24557e: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — A ref that does not carry the shape is refused

- **Status**: done
  the work namespace whose name does not match the policy's template is
  refused, naming the template and the command that renders it. The
  check uses the SAME parser the reconciler attributes with, compiled
  STRICTLY: the reader stays tolerant so existing work keeps
  attributing, while the writer cannot add a new name the system will
  not be able to read. A profile that gives every agent its own worktree
  keeps naming its branches freely.
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`,
  `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`,
  `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Read the full diff of eb42953c6 (the S3 delivery; 7 files, all declared). Verified in the current tree: (1) git-guard.ts refuseUnshapedWorkRef (lines 115-140) refuses a branch inside the work namespace whose name does not match the policy template — compiling the SAME parser the reconciler reads with, in strict mode, so the tolerant reader keeps accepting old shapes (S2) while the writer cannot add a name the system could never attribute; (2) the refusal names the template verbatim in its reason and states the command that renders it correctly in its remedy ('Let the name come from the policy instead of typing it: delendai work enter --proposal=<id> --slice=<id>'), exactly as the acceptance requires — convention enforced, not remembered; the commit message records the honest origin: the implementer's own hand-typed branch x00563-S2-g1-cli-shape violated the convention it was demonstrating; (3) a profile giving every agent its own worktree keeps naming branches freely — the scope is the pinned shared checkout only; (4) specs: git-guard.spec.ts pins 'refuses an un-namespaced work branch' and the whole matrix (direct commits, hand-made agent branches, allowed work/publication refs, tags never judged); the CLI specs that pinned the old dash shape were updated in the same commit. Gate run verbatim: npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts = 26/26 exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from commit eb42953c666c names refs/heads/delendai/wip/claude-opus-5/x00563-S2-g1-cli-shape (eb42953c666c85079d3dc99ae02cc224a4f5d542), opened by qwen-3.8-max
## acceptance

- A work ref renders as
  `<ns>/wip/<model>/<proposal>-<slice>-g<n>/<explanation>`, with the
  explanation as its own component, and parses back to the same identity.
- A project that sets `namespacePrefix` gets that same shape.
- A ref written under the dash shape still parses to its owner, its
  proposal, its slice, its generation and its topic.
- Creating a work ref whose name does not match the template is refused
  by git, with the command that renders the name correctly — so the
  convention is enforced rather than remembered.
