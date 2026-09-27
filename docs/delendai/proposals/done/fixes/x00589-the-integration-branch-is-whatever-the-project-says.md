---
id: x00589
title: "The integration branch is whatever the project says"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - agnostic
    - development-policy
---

# x00589 — The integration branch is whatever the project says

## goal

Nothing in this product assumes what a project calls its branches.

## why

`develop` is what **this** repository calls its integration branch.
Eleven source files treated it as a fact about every project:

```
branch-gc-engine.ts:346       baseBranch = options.baseBranch ?? 'develop'
swarm-hygiene-engine.ts:144   baseBranch = options.baseBranch ?? 'develop'
branch-status-engine.ts:300   baseBranch = options.baseBranch ?? 'develop'
branch-status.tool.ts:106     baseBranch = 'develop', agentPrefix = 'agent/'
release/index.ts:106          resolveRef(run, 'develop')
```

The first of those **deletes branches**. In a project whose trunk is
`main`, `trunk` or a release line, every judgement it made was against a
branch that does not exist — and `'agent/'` is the retired ref prefix,
so the status tool was looking for work under a namespace the canon
stopped using.

Doc comments said `Default `develop`` too, which is worse than a literal:
it tells the next reader something false.

This is dogfooding leaking into the product. The repository is allowed to
have habits; the product is not allowed to inherit them.

## why this design

The development policy already answers the question. What it could not
answer is a project that has declared nothing — and there the honest
answer is not a literal either: **it is the branch the workspace is
actually on.** Work started from a release line belongs to that release
line, and a project whose trunk is `main` never has to say so twice.

`resolveDevelopmentPolicy` stays pure — no filesystem, no git — so the
discovery happens at the edge, in `projectBranches`, which reads the
declared configuration first and the current branch second.

It lives in **core**, not in the plugin that needed it first, because
the CLI, the plugins and the scripts all ask the same question and one
source of truth was the point.

## non-goals

- Removing the protected-branch floors. `main`, `master`, `release` stay
  as a safety net; the project's own base branch is added to them at call
  time, so a trunk nobody else uses is as safe as one everybody does.
- Rewriting the release flow. It is baselined and visible, not fixed
  here.

## architecture

`projectBranches(workspaceRoot)` returns the integration branch and the
work-ref prefix: declared configuration, else the workspace's current
branch, else the policy default. `currentBranch` answers `undefined`
for a detached head or a directory that is not a repository, and neither
throws.

`lint:no-hardcoded-branch-names` refuses `develop`, `master` and `trunk`
as literals in product source. Tests are exempt — a fixture has to call
its branch something, and pinning a literal there is the point. Comments
are exempt for the same reason: a rule that punished the documentation
recording the decision would get the documentation deleted.

Fifteen files are baselined, visible as debt rather than forgotten.

## slices

### S1 — the branch comes from the project, and a rule keeps it that way

- **Status**: review
- **Files**: [`packages/core/src/lib/development-policy/project-branches.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`, `plugins/proposals/src/lib/shared/branch-gc-engine.ts`, `plugins/proposals/src/lib/shared/branch-status-engine.ts`, `plugins/proposals/src/lib/shared/swarm-hygiene-engine.ts`, `plugins/proposals/src/lib/tools/branch-status.tool.ts`, `tools/scripts/lint/no-hardcoded-branch-names.script.ts`, `tools/scripts/lint/no-hardcoded-branch-names.constant.ts`, `tools/scripts/lint/no-hardcoded-branch-names.interface.ts`, `tools/scripts/lint/no-hardcoded-branch-names.script.spec.ts`, `tools/scripts/lint/no-hardcoded-branch-names.baseline.json`, `package.json`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/project-branches.spec.ts`

## acceptance

- A project on `trunk`, `main` or `release/2026.4` with no configuration
  resolves that branch, not `develop`.
- A declared `branches.integration` wins over where the workspace is.
- The work-ref prefix comes from the policy namespace, never `agent/`.
- A detached head and a non-repository both answer without throwing.
- The lint refuses a literal in source, ignores tests and comments, and
  says nothing about a name that is not a trunk.

## risks and mitigations

- **A workspace on a feature branch adopts it as the integration
  branch.** Only when the project declared nothing at all, which is the
  case where any other answer would be a guess about somebody else's
  repository. Declaring one line settles it permanently.
