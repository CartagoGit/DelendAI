---
id: f00547
title: "Resolve what the installed framework version allows, recommends and forbids before an agent writes code"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-16
tags:
    - knowledge
    - frameworks
    - policy
    - tokens
---

# f00547 — Resolve what the installed framework version allows, recommends and forbids before an agent writes code

## goal

Before writing code, an agent can ask delendai one question and learn
what the project's INSTALLED framework version supports, what that
version recommends, what the project already does, and what the user
decided — as one small, versioned, evidence-backed answer.

## why

An agent writing an Angular component today guesses from general
training knowledge. It does not know which Angular is installed, whether
this project puts templates inline or in a file, or whether the user
decided otherwise. The result is code that compiles against the wrong
version, or fights the project's own conventions, and a reviewer who has
to explain the same thing again.

Detection already exists and is not the gap. `DEFAULT_FRAMEWORK_RULES`
(`packages/core/src/lib/bootstrap/framework-rules.ts`) maps a dependency
name to a framework id — angular, next, react, vue, svelte, solid — by
descending priority. `detect-stack-defaults.helper.ts` reads the
manifest and lockfile to name the package manager, language and test
runner. What is missing is everything after "which framework": the
resolved VERSION, what that version permits, and which of several
permitted spellings this project and this user actually want.

The second reason is token cost. An agent that researches "how does
Angular handle component styles" pays thousands of tokens for prose it
will use three lines of. A normalised answer of a few hundred tokens,
cached per resolved version, is the same knowledge at a fraction of the
budget — which is the same argument `docs/delendai/TOKEN-BUDGETS.md`
already makes for every other surface.

This is infrastructure. f00548 (style architecture) and f00549
(placement contracts) both consume it, so it lands first.

## non-goals

- **Not a crawler.** `web-fetch` is deliberately small: one allow-listed
  URL per call, a capped body, every redirect hop checked, fails closed
  without an allow-list, and excluded from every preset. This proposal
  inherits that posture with per-framework adapters and trusted domains.
  It never walks the open web, and it never treats a forum answer as a
  rule.
- **Not automatic migration.** Creating new code and changing existing
  code are different actions. A convention that changes does not
  authorise rewriting what already ships.
- **Not a replacement for framework detection.** The existing rule table
  stays the source of truth for "which framework"; this adds "which
  version, and what follows from it".

## slices

### S1 — Resolve the installed version, not just the framework id

- **Status**: pending
- **Files**: [`packages/core/src/lib/bootstrap/framework-version.ts`, `packages/core/src/lib/bootstrap/framework-version.spec.ts`, `packages/core/src/lib/contracts/interfaces/framework-version.interface.ts`]

Read the resolved version from the lockfile first and the manifest range
second, and say which of the two answered. A range with no lockfile is
reported as unresolved rather than guessed, because a rule keyed to the
wrong version is worse than no rule.

- **Gate**: `npx vitest run packages/core/src/lib/bootstrap/framework-version.spec.ts`

### S2 — A knowledge record with its evidence and its force

- **Status**: pending
- **Files**: [`plugins/framework-knowledge/src/lib/contracts/interfaces/knowledge-record.interface.ts`, `plugins/framework-knowledge/src/lib/knowledge/knowledge-record.ts`, `plugins/framework-knowledge/src/lib/knowledge/knowledge-record.spec.ts`]

Every rule carries what it says, the framework version it applies to,
where it came from, when it was retrieved, and its FORCE: `required`,
`recommended`, `supported`, `discouraged`, `deprecated` or `removed`.
Force is what makes the difference between "the project may choose" and
"this will not compile" — without it every rule reads as an order.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/knowledge/knowledge-record.spec.ts`

### S3 — Resolve project policy against framework force

- **Status**: pending
- **Files**: [`plugins/framework-knowledge/src/lib/policy/resolve-policy.ts`, `plugins/framework-knowledge/src/lib/policy/resolve-policy.spec.ts`]

One pure function decides the effective answer from an ordered set of
inputs: technical impossibility, explicit user configuration, explicit
project configuration, detected project convention, framework-version
recommendation, then delendai's default. A user preference wins over a
recommendation; it does not win over `removed`, which resolves to
`incompatible` with the reason named.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/policy/resolve-policy.spec.ts`

### S4 — Detected convention as an input, with its confidence

- **Status**: pending
- **Files**: [`plugins/framework-knowledge/src/lib/detect/detect-convention.ts`, `plugins/framework-knowledge/src/lib/detect/detect-convention.spec.ts`]

Count what the project actually does — 94 components with external
templates against 2 inline — and feed that in as a measured input with
its confidence, so a new agent adopts the project's existing shape
instead of its own habits.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/detect/detect-convention.spec.ts`

### S5 — The two tools, and a cache keyed by resolved version

- **Status**: pending
- **Files**: [`plugins/framework-knowledge/src/index.ts`, `plugins/framework-knowledge/src/lib/tools/guidance.tool.ts`, `plugins/framework-knowledge/src/lib/tools/source.tool.ts`, `plugins/framework-knowledge/src/lib/cache/knowledge-cache.ts`, `plugins/framework-knowledge/src/lib/cache/knowledge-cache.spec.ts`]

`framework_guidance { topic }` returns the small resolved answer;
`framework_source { ruleId }` returns the evidence behind one rule, only
when asked. The cache lives under `.cache/delendai/knowledge/<framework>/<version>/`,
is invalidated when the lockfile entry changes, survives offline, and
keeps summary and evidence apart so the common path stays cheap.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/cache/knowledge-cache.spec.ts && bun run lint:unregistered-tools`

## acceptance

- `framework_guidance` answers for a project whose framework and version
  are resolved, and reports `unresolved` rather than guessing when they
  are not.
- A rule whose force is `removed` refuses a user preference that asks
  for it, naming the version that removed it.
- Asking the same topic twice hits the cache and performs no network
  call; changing the lockfile entry invalidates it.
- No network access happens outside a per-framework adapter's trusted
  domains, and the plugin is not in any preset.

## notes

- Scope profiles matter in a monorepo: `apps/admin` may be Angular while
  `apps/storefront` is React, so resolution is per scope, not per repo.
- delendai's own stack is the first consumer but not the only shape —
  the plugin must stay host-agnostic, as `conventions` already is.
