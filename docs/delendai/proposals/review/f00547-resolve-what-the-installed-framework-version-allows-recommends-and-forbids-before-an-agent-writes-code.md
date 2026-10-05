---
id: f00547
title: "Resolve what the installed framework version allows, recommends and forbids before an agent writes code"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-09-16
tags:
    - knowledge
    - frameworks
    - policy
    - tokens
last-transition-id: e019cacf-e6ba-4421-b1fb-6962644c2a19
last-correlation-id: e019cacf-e6ba-4421-b1fb-6962644c2a19
last-transition-from: in-progress
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

- **Status**: review
- **Files**: [`packages/core/src/lib/bootstrap/framework-version.ts`, `packages/core/tests/src/lib/bootstrap/framework-version.spec.ts`, `packages/core/src/lib/contracts/interfaces/framework-version.interface.ts`]

Read the resolved version from the lockfile first and the manifest range
second, and say which of the two answered. A range with no lockfile is
reported as unresolved rather than guessed, because a rule keyed to the
wrong version is worse than no rule.

- **Gate**: `env -u CLAUDECODE -u AI_AGENT bunx vitest run packages/core/tests/src/lib/bootstrap/framework-version.spec.ts`

2026-09-30: Implemented `resolveFrameworkVersion`/`extractLockfileVersion`/
`isExactVersion` in `framework-version.ts`, pure and agnostic of package
manager — dispatches on lockfile kind (`bun.lock`, `package-lock.json`
v1/v3, `yarn.lock`, `pnpm-lock.yaml`), the same four kinds
`detect-stack-defaults.helper.ts` already lists via
`listPackageManagerLockfiles()`. Correction to this slice's own **Files**
list: the repo's real spec convention mirrors `src/` under a sibling
`tests/` tree (see `framework-rules.spec.ts` at
`packages/core/tests/src/lib/bootstrap/`), not a colocated
`framework-version.spec.ts` next to the source file as originally
written — the Gate command above is corrected to match. Verified: 13/13
tests pass (`env -u CLAUDECODE -u AI_AGENT bunx vitest run
packages/core/tests/src/lib/bootstrap/framework-version.spec.ts`);
coverage on `framework-version.ts` is 100% statements/functions/lines,
88.88% branches (threshold 82/83/83/69).
- shipped-in: `97ed3389c329`

### S2 — A knowledge record with its evidence and its force

- **Status**: review
- **Files**: [`plugins/framework-knowledge/package.json`, `plugins/framework-knowledge/plugin.manifest.ts`, `plugins/framework-knowledge/tsconfig.json`, `plugins/framework-knowledge/vitest.config.ts`, `plugins/framework-knowledge/LICENSE`, `plugins/framework-knowledge/src/index.ts`, `plugins/framework-knowledge/src/public/index.ts`, `plugins/framework-knowledge/src/lib/contracts/interfaces/knowledge-record.interface.ts`, `plugins/framework-knowledge/src/lib/contracts/constants/knowledge-force.constant.ts`, `plugins/framework-knowledge/src/lib/knowledge/knowledge-record.ts`, `plugins/framework-knowledge/tests/src/lib/knowledge/knowledge-record.spec.ts`, `plugins/framework-knowledge/tests/src/plugin-wiring.spec.ts`, `bun.lock`]

Every rule carries what it says, the framework version it applies to,
where it came from, when it was retrieved, and its FORCE: `required`,
`recommended`, `supported`, `discouraged`, `deprecated` or `removed`.
Force is what makes the difference between "the project may choose" and
"this will not compile" — without it every rule reads as an order.

- **Gate**: `env -u CLAUDECODE -u AI_AGENT bunx vitest run plugins/framework-knowledge/tests/src/lib/knowledge/knowledge-record.spec.ts`

2026-09-30: `plugins/framework-knowledge/` did not exist; this slice
creates the plugin's bare package skeleton (package.json,
plugin.manifest.ts — `maturity: 'experimental'`, `presets: []`, no
tools yet — tsconfig.json, vitest.config.ts,
LICENSE, modelled on the existing `self-learning` plugin, itself
`presets: []`) alongside this slice's own library: `IKnowledgeRecord` /
`IKnowledgeForce` / `IKnowledgeEvidence` and `createKnowledgeRecord` /
`FORCE_VALUES` / `forceRank` / `isKnowledgeForce`. `src/index.ts`
registers zero tools (`register() { return { tools: [] }; }`) — S5
adds `framework_guidance` / `framework_source`. The manifest schema
refuses an empty `permissions` array, so it declares `['filesystem-read']`
(the one permission every consumer will need to read the manifest/
lockfile) rather than `[]`; S5 decides whether its tools need more.
Correction to this slice's own **Files** list:
added the scaffold files (not listed in the original proposal, which
assumed the plugin already had somewhere for S2's two files to live)
and corrected the spec path to the repo's real `tests/src/lib/...`
convention (see S1's note). Verified: 16/16 tests pass (`env
-u CLAUDECODE -u AI_AGENT bunx vitest run plugins/framework-knowledge/tests`);
coverage on the plugin's `src/**` is 100% statements/branches/functions/lines
(the interface file has 0 coverable statements, which does not depress
the PR's aggregated changed-file coverage — `tools/scripts/ci/changed-file-coverage.script.ts`
sums counts across files rather than averaging percentages, so a 0/0
file contributes nothing to either side of the ratio). `FORCE_VALUES`
(SCREAMING_SNAKE) and `ICreateKnowledgeRecordResult` moved out of
`knowledge-record.ts` into `contracts/constants/knowledge-force.constant.ts`
and the interface file respectively, per `lint:types-in-contracts`
(caught by `gates.sh`, not something the proposal anticipated).
- shipped-in: `f75161fa8386`

### S3 — Resolve project policy against framework force

- **Status**: review
- **Files**: [`plugins/framework-knowledge/src/lib/policy/resolve-policy.helper.ts`, `plugins/framework-knowledge/src/lib/contracts/interfaces/policy.interface.ts`, `plugins/framework-knowledge/tests/src/lib/policy/resolve-policy.spec.ts`]

One pure function decides the effective answer from an ordered set of
inputs: technical impossibility, explicit user configuration, explicit
project configuration, detected project convention, framework-version
recommendation, then delendai's default. A user preference wins over a
recommendation; it does not win over `removed`, which resolves to
`incompatible` with the reason named.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/policy/resolve-policy.spec.ts`
- shipped-in: `7cf206f4d2f8`

### S4 — Detected convention as an input, with its confidence

- **Status**: review
- **Files**: [`plugins/framework-knowledge/src/lib/detect/detect-convention.helper.ts`, `plugins/framework-knowledge/src/lib/contracts/interfaces/convention.interface.ts`, `plugins/framework-knowledge/src/lib/contracts/constants/convention.constant.ts`, `plugins/framework-knowledge/tests/src/lib/detect/detect-convention.spec.ts`]

Count what the project actually does — 94 components with external
templates against 2 inline — and feed that in as a measured input with
its confidence, so a new agent adopts the project's existing shape
instead of its own habits.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/detect/detect-convention.spec.ts`
- Below 5 occurrences, on a tie at the top, or under a 60% share there is
  no convention: a weak habit fed to the resolver would outrank the
  framework's own recommendation.
- shipped-in: `30680e32ef2b`

### S5 — The two tools, and a cache keyed by resolved version

- **Status**: review
- **Files**: [`plugins/framework-knowledge/src/index.ts`, `plugins/framework-knowledge/plugin.manifest.ts`, `plugins/framework-knowledge/src/lib/tools/guidance.tool.ts`, `plugins/framework-knowledge/src/lib/tools/source.tool.ts`, `plugins/framework-knowledge/src/lib/tools/knowledge-output.schema.ts`, `plugins/framework-knowledge/src/lib/cache/knowledge-cache.ts`, `plugins/framework-knowledge/src/lib/resolve/installed-framework.helper.ts`, `plugins/framework-knowledge/src/lib/contracts/interfaces/knowledge-cache.interface.ts`, `plugins/framework-knowledge/src/lib/contracts/constants/knowledge-cache.constant.ts`, `plugins/framework-knowledge/tests/src/lib/cache/knowledge-cache.spec.ts`, `plugins/framework-knowledge/tests/src/lib/tools/framework-tools.spec.ts`, `plugins/framework-knowledge/tests/src/plugin-wiring.spec.ts`, `packages/core/src/public/index.ts`]

`framework_guidance { topic }` returns the small resolved answer;
`framework_source { ruleId }` returns the evidence behind one rule, only
when asked. The cache lives under `.cache/delendai/knowledge/<framework>/<version>/`,
is invalidated when the lockfile entry changes, survives offline, and
keeps summary and evidence apart so the common path stays cheap.

- **Gate**: `npx vitest run plugins/framework-knowledge/tests/src/lib/cache/knowledge-cache.spec.ts && bun run lint:unregistered-tools`
- Shipped: `knowledge-cache.ts` stores `summary.json` (records without
  evidence), `evidence.json` and `meta.json` per framework and version;
  `meta.json` names the lockfile entry (`<source>:<dep>@<version>`) and is
  written last, so a changed entry reads as `stale` and a half-written set
  is never visible. Reads never touch the network.
- `framework_guidance` resolves the framework and version through core's
  `matchFramework` and `resolveFrameworkVersion` (now exported from
  `@delendai/core/public`, with this plugin as the consumer), reads the
  summary for the topic only and runs `resolvePolicy` over it. It answers
  `unresolved` when no version is known and `no-knowledge` on a cache
  miss. `framework_source` opens only the evidence file.
- Not provided by S1-S4 and kept minimal here: the reading of
  `package.json` and the lockfile (`installed-framework.helper.ts`).
  Nothing populates the cache yet: the per-framework adapters with
  trusted domains are a later slice; `writeKnowledge` is the seam they
  will use. The detected convention (S4) is not an input of the tool yet,
  because it needs a project scan that no tool owns.
- The spec lives at `tests/src/lib/cache/`, the repo's real convention,
  not next to the source as the first draft of this slice said.
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- shipped-in: `f75161fa8386`

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
