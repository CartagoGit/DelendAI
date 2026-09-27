---
id: x00597
title: "A ref changes hands by changing its name"
kind: fix
status: review
type: proposal
track: swarm
date: 2026-09-22
tags:
    - work-refs
    - swarm
---

# x00597 — A ref changes hands by changing its name

## goal

A unit of work is named after whoever is actually doing it.

## why

A work ref is named after its owner. That is the whole point of
`{ns}/wip/{model}/{proposal}-{slice}-g{n}/{topic}`: it answers "who is
doing this" without anyone having to ask.

So a ref one agent abandoned and another picked up is a ref that lies.
It happened here. codex left

```
delendai/wip/codex-astra-6/f00551-S0-g1/batuta-registration-and-reconciliation
```

behind; somebody else finished the work on it. For as long as that
lasted, `work swarm` reported codex as the owner of work codex was not
doing, overlap detection attributed the paths to codex, and anyone
deciding whether to touch those files got the wrong answer about who to
talk to. Every question the naming scheme exists to answer was answered
wrongly.

The rename is mechanical. "The agent that takes it over should notice
and rename it" is a rule that depends on an LLM remembering — which is
exactly the class of rule this project keeps discovering was never
followed.

## non-goals

- Automatic takeover. Deciding that somebody has abandoned their work is
  a judgement, not a timeout, and this does not make it. `work claim`
  with no `--ref` lists what is takeable and takes nothing.
- Moving commits. A claim renames; it never rebases, squashes or
  force-updates anything.

## architecture

`delendai work claim` with no `--ref` lists every unit of work in the
clone that is not named after you, with the name it would become.
`--ref=<ref>` takes one.

**The generation goes up.** `g{n}` is which attempt this is, and a
different hand on the same slice is a different attempt. Keeping `g1`
would produce two refs claiming to be the same generation by different
agents, and the history would say they were one run.

**The order is the safety.** Create the new name, prove by `rev-parse`
that it resolves to the same commit, and only then delete the old one. A
failed proof leaves both names in place, which is recoverable; deleting
first and failing to create is not. If the deletion itself fails, both
names hold the work and that is reported rather than repaired blindly.

**It refuses rather than guesses.** A ref whose subject does not read as
`{proposal}-{slice}-g{n}/{topic}` — codex's other ref,
`…/codex-batuta-orchestrator/f00551-S0-g1/work`, was one — has no honest
new name, because inventing one means guessing which slice it is about
and a wrong guess produces a ref claiming work it is not.

## slices

### S1 — claiming renames, proves, and only then deletes

- **Status**: review
- **Files**: [`packages/cli/src/lib/work-claim.service.ts`, `packages/cli/src/lib/work-claim.service.spec.ts`, `packages/cli/src/contracts/interfaces/work-claim.interface.ts`, `packages/cli/src/lib/work-ref-shape.service.ts` (the pattern this
  slice shipped in `work-claim.constant.ts`; x00610 replaced that hand-written
  twin of the shape with one derived from the policy's template, and deleted
  the constant), `packages/cli/src/commands/work.command.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/work-claim.service.spec.ts`

### S2 — every refusal is exercised, and the proof step is guarded

- **Status**: review
- **Files**: [`packages/cli/src/lib/work-claim.service.ts`, `packages/cli/src/lib/work-claim.service.spec.ts`, `packages/cli/src/commands/work-claim.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/work-claim.service.spec.ts packages/cli/src/commands/work-claim.command.spec.ts`

## acceptance

Against a real git repository, and then through the real CLI:

- Claiming `…/codex-astra-6/f00551-S0-g1/batuta` as `claude-opus-5`
  produces `…/claude-opus-5/f00551-S0-g2/batuta` pointing at **the same
  commit**, and the old ref is gone.
- Listing shows only what somebody else holds; a ref already yours is
  not offered and is left alone.
- A ref that is already yours, one outside the project's work-ref space,
  one whose subject cannot be read, and an invocation with no agent
  identity are each refused with the reason.
- The refusal path leaves every ref exactly as it found it — proven for
  a name git will not take, for a proof that does not match, and for a
  deletion that fails because somebody moved the ref underneath.
- The subcommand lists without taking, moves when given `--ref`, and
  refuses a ref this clone cannot resolve and a project with no
  development policy.

## risks and mitigations

- **Two agents claiming the same ref.** The second finds it gone and is
  told so; the first holds it. `update-ref` is the arbiter, which is the
  right one — it is the only thing both of them share.
- **A claim of work that was not abandoned.** It is a deliberate command
  with an explicit `--ref`, and the previous owner sees their ref
  renamed rather than deleted. Nothing is lost either way.
