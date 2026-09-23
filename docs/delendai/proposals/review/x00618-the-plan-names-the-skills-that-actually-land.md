---
id: x00618
title: "The plan names the skills that actually land"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["f936bf444"]
---

# x00618 — The plan names the skills that actually land

## goal

The adoption plan lists *our canonical skills* under a sentence saying
they are "migrated into `docs/delendai/skills/` from scratch". It listed
27 while `init` copied 8. A plan that names skills the act does not
deliver is worth less than no plan.

## why

This is my own regression, from x00614, and it is worth writing down
because it is the same defect in the opposite direction.

Before x00614 the plan's table was hand-written and had drifted: 18 of 27
skills, five disagreeing about who they apply to, two that `init` installs
missing entirely. x00614 generated it from the skill manifest — which
fixed the disagreement and introduced a new one, because the manifest is
the wrong list for this question. It answers "which skills exist"; the
plan's sentence promises "which skills land here", and only the ones whose
body ships in the core bundle do.

Measured in a consumer project: the plan named 27, `init` wrote 8.

## why this design

**Two promises, two lists.** `init` copies the skills whose body ships in
the core bundle and that declare themselves relevant to an adopter; the
rest exist and travel with the plugin they belong to. Collapsing both into
one list was false whichever way it leaned — 18 of 27 before, 27 against 8
after. The plan now says which is which, and the second list is useful on
its own: it tells an adopter what adopting a plugin would bring.

**Derived from the same two questions the projection asks.** `bundled` is
computed in the generator with the predicate the projection uses — body in
the core bundle, and `appliesTo` covering an adopter — so the plan and the
act cannot disagree again. If the projection's rule changes, the generated
table changes with it and `gen:all --check` says so.

## non-goals

- Changing which skills `init` copies. That rule is unchanged; this makes
  the plan tell the truth about it.

## Slices

### S1 — The plan separates what lands from what exists

- **Status**: done — verified in a throwaway consumer project by
  comparing the plan's list against the directories on disk: **8 and 8,
  identical**. 19 skills move to the second heading, which is where they
  were always true.
- **Gate**: `npx vitest run packages/cli/src/lib/init`
- **Files**: `tools/scripts/gen/init-skill-inventory.script.ts`,
  `packages/cli/src/lib/init/init-skill-inventory.generated.ts`,
  `packages/cli/src/contracts/interfaces/init.interface.ts`,
  `packages/cli/src/lib/init/init-adoption-plan.builder.ts`
- Each canonical skill carries `bundled`, computed with the projection's
  own predicate; the plan lists the bundled ones under the migrate
  sentence and the rest under a heading that says `init` does not copy
  them.

## acceptance

In a consumer project, the skills the plan names under "Migrate OUR
canonical skills" and the directories `init` writes into
`docs/delendai/skills/` are the same set — measured, not asserted.
