---
id: f00539
title: "Configurable CI/PR policy with free-tier autodetection"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00539 — Configurable CI/PR policy with free-tier autodetection

## Goal

Convert the implicit push + open-PR + wait-CI + merge pipeline into a declarative fail-closed policy that autodetects free-tier (github.com public, gitlab.com internal, self-hosted runners), executes automatically when provably free, prompts with an estimated cost when paid below ceiling, blocks when above ceiling, and degrades with documented technical fallbacks when API autodetection fails. Default ci.enabled=false (fail-closed).

## why

Today `auto_work` pushes PRs without asking. In public GitHub the runners are free so dogfooding is OK. In private repos, GitHub Teams/Enterprise, paid Bitbucket, or any metered self-hosted CI, a single run costs money; a long proposal cascade can cost hundreds of USD silently overnight. The cost landscape is non-uniform across providers and plans and a binary enable flag cannot capture it. The fix is a decision engine that consumes the visibility + free-tier state and emits one of auto-execute | ask-user | manual-only | block.

## non-goals

- Not building local runners automatically.
- Not migrating repos between hosts.
- Not detecting expired free-tiers from account age history.
- Not doing the actual CI run, only the gating before push or PR.
- Not handling vendor-locked plans via SDK calls, only public visibility APIs.

## Slices

- global_gate: type

### S1 — Schema and validation
- **Status**: pending
- **Files**: `delendai.config.json`, `packages/core/src/lib/config/schema.ts`, `packages/core/src/lib/config/ci-policy.ts`, `packages/core/tests/src/lib/config/ci-policy.spec.ts`
- **Gate**: type
- acceptance:
  - "delendai.config.json#ci schema validated by Zod on load."
  - "Missing or malformed ci block fails fast with actionable error."
  - "Default config ships enabled=false, dryRun=true, freeTierAutoExecute=true."
  - "Migration: configs without ci block are accepted and treated as enabled=false."

### S2 — Provider capability registry
- **Status**: pending
- **Files**: `packages/core/src/lib/ci/capability-matrix.ts`, `packages/core/src/lib/ci/provider-github.ts`, `packages/core/src/lib/ci/provider-gitlab.ts`, `packages/core/src/lib/ci/provider-bitbucket.ts`, `packages/core/src/lib/ci/provider-selfhosted.ts`, `packages/core/tests/src/lib/ci/capability-matrix.spec.ts`
- **Gate**: type
- acceptance:
  - "Matrix covers at least github.com public, github.com private, github enterprise, gitlab.com public private internal, gitlab self-hosted with without CI, bitbucket cloud public private, self-hosted with CI, no CI available."
  - "Each row declares free tier boolean, free-tier-remaining estimation source, decision hint, degradation path."
  - "Conformance suite asserts each row produces a stable decision given a fixture."

### S3 — Visibility detector with cache and degradation
- **Status**: pending
- **Files**: `packages/core/src/lib/ci/detect-visibility.ts`, `packages/core/src/lib/ci/cache.ts`, `packages/core/src/lib/ci/providers/github-visibility.ts`, `packages/core/src/lib/ci/providers/gitlab-visibility.ts`, `packages/core/src/lib/ci/providers/bitbucket-visibility.ts`, `packages/core/src/lib/ci/providers/git-remote-fallback.ts`, `packages/core/tests/src/lib/ci/detect-visibility.spec.ts`
- **Gate**: type
- acceptance:
  - "GitHub GitLab Bitbucket visibility queried via the corresponding API when a token is configured."
  - "Cache TTL 24h; key is provider + remote + auth-scope."
  - "Cache invalidated on proposal_close."
  - "Fallback chain: provider API to git remote get-url (no visibility) to unknown."
  - "Rate-limit (403 + Retry-After) returns degraded decision, not a crash."

### S4 — Cost estimator and decision engine
- **Status**: pending
- **Files**: `packages/core/src/lib/ci/cost-estimator.ts`, `packages/core/src/lib/ci/decision-engine.ts`, `packages/core/src/lib/ci/decision.ts`, `packages/core/tests/src/lib/ci/decision-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "Estimator returns USD per minute for linux-2-core, linux-4-core, windows-4-core, macos-m1."
  - "Decision engine emits one of auto-execute, ask-user, manual-only, block."
  - "Cost equals estimated minutes times USD per minute, compared to costCeilingUSD."
  - "Decision is logged structured with decision, reason, estimatedCostUSD, freeTier."

### S5 — auto_work integration and gate
- **Status**: pending
- **Files**: `plugins/proposals/src/tools/auto-work.tool.ts`, `plugins/proposals/src/policy/ci-cost.ts`, `plugins/proposals/tests/policy/ci-cost.spec.ts`, `plugins/proposals/tests/policy/auto-work-gate.spec.ts`
- **Gate**: type
- acceptance:
  - "Before any push PR auto_work consults the decision engine."
  - "manual-only returns actionable error pointing to the exact config field to flip."
  - "ask-user triggers an interactive prompt with the estimated USD cost."
  - "block aborts with ceiling-exceeded message and a how-to-override hint."
  - "auto-execute proceeds silently and logs the decision with reason."

### S6 — Degradation and notification channels
- **Status**: pending
- **Files**: `packages/core/src/lib/ci/degraded.ts`, `packages/core/src/lib/ci/notify.ts`, `packages/core/tests/src/lib/ci/degraded.spec.ts`
- **Gate**: type
- acceptance:
  - "When autodetection fails (rate limit, no token, self-hosted without DNS) degradedBehavior manual | fail | ask is applied."
  - "Each channel log event webhook is exercised in tests."
  - "Structured log includes the fallback path taken."

### S7 — Self-hosted runner discovery (optional)
- **Status**: pending
- **Files**: `packages/core/src/lib/ci/runner-discovery.ts`, `packages/core/tests/src/lib/ci/runner-discovery.spec.ts`
- **Gate**: type
- acceptance:
  - "When the provider exposes list-runners capability (consumed from P2 once available) self-hosted runners are enumerated."
  - "If at least one runner is online, free-tier confidence is boosted (decision may upgrade to auto-execute)."
  - "If self-hosted and runners exist, public-visibility is no longer needed to skip the prompt."

### S8 — Cost model documentation
- **Status**: pending
- **Files**: `docs/delendai/ci-cost-model.md`, `docs/delendai/ci-policy-config.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "ci-cost-model.md covers one paragraph per provider with current free-tier limits and links to official pricing pages."
  - "ci-policy-config.md walks through every ci.* config field with an example."
  - "CHANGELOG entry explains the default enabled=false change."

## acceptance

- delendai.config.json#ci schema validated by Zod on load.
- Missing or malformed ci block fails fast with actionable error.
- Default config ships enabled=false, dryRun=true, freeTierAutoExecute=true.
- Migration: configs without ci block are accepted and treated as enabled=false.
- Matrix covers at least github.com public, github.com private, github enterprise, gitlab.com public private internal, gitlab self-hosted with without CI, bitbucket cloud public private, self-hosted with CI, no CI available.
- Each row declares free tier boolean, free-tier-remaining estimation source, decision hint, degradation path.
- Conformance suite asserts each row produces a stable decision given a fixture.
- GitHub GitLab Bitbucket visibility queried via the corresponding API when a token is configured.
- Cache TTL 24h; key is provider + remote + auth-scope.
- Cache invalidated on proposal_close.
- Fallback chain: provider API to git remote get-url (no visibility) to unknown.
- Rate-limit (403 + Retry-After) returns degraded decision, not a crash.
- Estimator returns USD per minute for linux-2-core, linux-4-core, windows-4-core, macos-m1.
- Decision engine emits one of auto-execute, ask-user, manual-only, block.
- Cost equals estimated minutes times USD per minute, compared to costCeilingUSD.
- Decision is logged structured with decision, reason, estimatedCostUSD, freeTier.
- Before any push PR auto_work consults the decision engine.
- manual-only returns actionable error pointing to the exact config field to flip.
- ask-user triggers an interactive prompt with the estimated USD cost.
- block aborts with ceiling-exceeded message and a how-to-override hint.
- auto-execute proceeds silently and logs the decision with reason.
- When autodetection fails (rate limit, no token, self-hosted without DNS) degradedBehavior manual | fail | ask is applied.
- Each channel log event webhook is exercised in tests.
- Structured log includes the fallback path taken.
- When the provider exposes list-runners capability (consumed from P2 once available) self-hosted runners are enumerated.
- If at least one runner is online, free-tier confidence is boosted (decision may upgrade to auto-execute).
- If self-hosted and runners exist, public-visibility is no longer needed to skip the prompt.
- ci-cost-model.md covers one paragraph per provider with current free-tier limits and links to official pricing pages.
- ci-policy-config.md walks through every ci.* config field with an example.
- CHANGELOG entry explains the default enabled=false change.
