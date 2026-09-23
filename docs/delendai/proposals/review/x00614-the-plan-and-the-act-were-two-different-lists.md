---
id: x00614
title: "The plan and the act were two different lists"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["794629862"]
---

# x00614 — The plan and the act were two different lists

## goal

`delendai init` shows an adopter a plan naming the skills it will bring,
and then installs a different set. The plan was a hand-written table asked
to mirror the skill manifest; it had drifted in seven places. Who a skill
is for must be declared once and read everywhere.

## why

Measured against `packages/core/skills/manifest.json`:

- the plan lists **18** of the manifest's **27** skills;
- **five** entries disagree with the manifest about who the skill applies
  to — `conventional-commits-and-release` and `token-budget-discipline`
  are promised to `@delendai/*` when the manifest scopes them to
  `@delendai/core`; `concurrency-patterns`, `multi-agent-coordination`
  and `quality-and-rules-gates` each lose a target;
- **two** skills that `init` actually installs — `error-collection` and
  `tabs-component` — are missing from the plan entirely.

So what an adopter is promised and what lands in their repository are two
different lists, and nothing in the build could notice.

The table says so itself:

> *This mirrors `packages/core/skills/manifest.json`; when a skill is
> added there, add a row here too.*

A comment asking the next person to keep two things in step is a plan for
drift, not against it.

## why this design

**Generated, not read at plan time.** The constraint that made the table
static is real and is kept: the plan is built with a reader bounded to the
TARGET workspace, so our own skill set cannot be read from disk there, and
the manifest carries a timestamp that would make the rendered plan
non-deterministic. Generating the table preserves every property it had —
static, embedded, id-sorted, no timestamp — and removes the only one
nobody wanted: the ability to disagree.

**Wired into `gen:all` with a `--check`.** The repository already carries
generated registries this way, and drift then fails in CI rather than in
an adopter's plan. Proven by breaking it on purpose: an edited row makes
`--check` refuse and name the command that fixes it.

## non-goals

- Changing which skills `init` installs. That selection is made by a
  skill's *location* (`packages/core/skills/`) rather than by what it
  declares, which is a second instance of this same problem and deserves
  its own slice — see notes.

## Slices

### S1 — The plan is generated from the declaration

- **Status**: done — the table is generated from the manifest and wired
  into `gen:all` with a `--check`; proven by breaking a row on purpose and
  watching `--check` refuse and name the fix. Adding a step is itself
  gated: `gen-all.spec.ts` pins the step list, so a new generator has to
  be declared deliberately rather than appearing.
- **Gate**: `npx vitest run tools/scripts/gen-all.spec.ts packages/cli/src/lib/init`
- **Files**: `tools/scripts/gen/init-skill-inventory.script.ts`,
  `packages/cli/src/lib/init/init-skill-inventory.generated.ts`,
  `packages/cli/src/lib/init/init-skill-inventory.constant.ts`,
  `tools/scripts/gen-all.script.ts`, `tools/scripts/gen-all.spec.ts`
- The adoption plan's skill table is generated from the skill manifest and
  checked for drift by `gen:all --check`; the hand-written table is gone.

## notes

**The selector reads location, not declaration.** `init` projects a core
skill when its `bodyPath` starts with `packages/core/skills/`. Every skill
also declares `appliesTo`, that declaration is copied into the adopter's
manifest, and it decides nothing. The visible cost today:
`delendai-tabs-component` declares `appliesTo: ['@delendai/*']` while its
body documents `apps/web/src/components/ui/Tabs.astro` — this
repository's own website — and it is installed into every adopter. Two
fixes belong together there: correct that declaration to `@delendai/web`,
and make the projection select on what a skill declares rather than on
where it happens to sit.

## acceptance

- The generated table names all 27 skills with the manifest's own
  `appliesTo`, and `gen:all --check` refuses a hand edit.
- `init`'s plan and `init`'s writes name the same skills.
