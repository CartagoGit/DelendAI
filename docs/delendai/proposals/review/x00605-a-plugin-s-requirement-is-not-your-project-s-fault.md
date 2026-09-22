---
id: x00605
title: "A plugin's requirement is not your project's fault"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
tags:
    - adoption
---

# x00605 — A plugin's requirement is not your project's fault

## goal

The first thing delendai says to a project is true about that project.

## why

`delendai init --dry-run`, in a project with no `.env`, no database and
no reason to have either:

```
delendai › env warning
high/critical env findings detected before bootstrap:
- Required variable "DATABASE_URL" is missing from .env.
```

Read that as the person who just pointed a tool at their repository.
Something is **critically** wrong, apparently, and it is about a
database they do not have.

`DATABASE_URL` is declared by the **`database` plugin**. The `swarm`
preset carries that plugin, nobody asked for it, and under the lazy
surface it is not even active — it will never run unless something
activates it, at which point it can say what it needs.

So the finding is real and the framing is false. A requirement of a
plugin is a fact about the plugin. Presented as "high/critical findings
detected", it reads as an accusation about the project, from a tool that
has been there for four seconds.

## non-goals

- Suppressing it. A project that DOES want the database plugin needs to
  know, and finding out at first contact is better than on first use.
- Deciding severity for the env plugin. `checkSchema` still classifies;
  what changes is what `init` does with the answer.

## architecture

`readEnvWarningFindings` returns the requirements alongside the
findings, plus the variable names the project's `.env` actually defines.
A finding on its own cannot say WHO wants the variable, and that is the
whole difference between a fact and an accusation.

The block then reads:

```
delendai › plugins that need configuring
Nothing is wrong with this project. Plugins in the selected preset
declare environment variables, and these are not set:
- DATABASE_URL — the `database` plugin wants it for Database DSN.
Set them when you need those plugins, or drop the plugins. Neither
blocks the bootstrap.
```

Findings that are *not* a plain missing requirement — a declared
variable with the wrong shape — still print as they did, because those
are about the project.

## slices

### S1 — the requirement names its plugin

- **Status**: review
- **Files**: [`packages/cli/src/commands/init/init.command.ts`, `packages/cli/src/contracts/interfaces/env-warning.interface.ts`, `packages/cli/src/commands/init/init.command.spec.ts`, `packages/cli/src/lib/init/init-default.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/commands/init/init.command.spec.ts`

## acceptance

- `readEnvWarningFindings` returns the `database` plugin alongside the
  `DATABASE_URL` finding, and the set of variables the project's `.env`
  defines.
- Driven through the real CLI in a consumer project, `init --dry-run`
  names the plugin, says nothing is wrong with the project, and says the
  bootstrap is not blocked.
- The existing cases hold: a catalogued plugin is never probed, an
  uncatalogued one still is, and a preset without the `env` plugin asks
  nobody.
- `init:default` prints the same block, and its spec asserts the claim
  rather than the old wording — including that `high/critical` is gone.
- 605 cli tests pass.

## risks and mitigations

- **Somebody ignoring a real misconfiguration because the tone softened.**
  The line still names the variable and the plugin, and a wrongly-shaped
  value still prints as before. What is gone is the claim that the
  project is critically broken.

## notes

Found by running `init --dry-run` in a temporary consumer project — the
same method that found x00602 and x00604. The dry run itself is clean:
it touches nothing, and every file it proposes is delendai's own.
