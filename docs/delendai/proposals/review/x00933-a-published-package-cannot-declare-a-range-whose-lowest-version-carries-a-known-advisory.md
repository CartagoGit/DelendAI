---
id: x00933
title: "A published package cannot declare a range whose lowest version carries a known advisory"
kind: fix
status: review
type: proposal
track: security
date: 2026-10-22
last-transition-id: 781aa956-9f9e-41a8-8391-39fb76ef4186
last-correlation-id: 781aa956-9f9e-41a8-8391-39fb76ef4186
last-transition-from: in-progress
last-transition-at: 2026-10-22T15:14:04.472Z
shipped-in:
  - "65822541bff741ebfd9438f1dfa81b75a0a0f5e9"
---

# x00933 — A published package cannot declare a range whose lowest version carries a known advisory

## goal

Every dependency range a publishable package declares admits no version with a known advisory at its floor, and the advisory gate checks those floors as well as the lockfile, so an adopter installing a delendai package cannot resolve a vulnerable version the repository itself never runs.

## why

On 2026-10-22 four Dependabot alerts opened on main for `@modelcontextprotocol/sdk` (GHSA-22jm-h49p-29qw and GHSA-46jr-4wx8-v453 high, GHSA-6prh-2h8m-c8cw and GHSA-rvq5-wwqv-78pq moderate, all `<1.32.0`). The root and `apps/web` manifests already pin 1.32.0 on develop, and `lint:dependency-advisories` is green there: it reads the lockfile, which resolves 1.32.0.

But 46 publishable packages declare `"@modelcontextprotocol/sdk": "^1.31.0"`. Their tests run against the locked 1.32.0; an adopter installing `@delendai/<plugin>` beside an SDK already at 1.31.x keeps it, because `^1.31.0` allows it. The repository never runs that version and no gate sees it. The same holds for `plugins/browser`'s `"playwright": ">=1.40.0"`, whose floor carries GHSA-7mvr-c777-76hp (high, `<1.55.1`). Root `overrides` fix the lockfile only; they do not travel with a published package.

The npm bulk advisory endpoint `bun audit` already uses answers for a list of versions: asked for each declared range's floor, it returned the four SDK advisories for 1.31.0 and the playwright one for 1.40.0, and nothing for the other floors below the lock (`zod ^4.0.0`, `yaml 2.9.0`, `typescript >=5.0.0`). A rule of 'floor at least the locked version' would wrongly fail those deliberately broad peer ranges; the advisory rule fails exactly the two real ones.

## non-goals

- Promoting develop to main. The four alerts close when the release that already carries 1.32.0 reaches main; that is the release flow's decision.
- Narrowing peer ranges that carry no advisory at their floor.
- Changing the exceptions file's rules: an advisory with no patched version keeps its dated exception.

## slices

- global_gate: type

### S1 — The advisory gate checks every published range's floor
- **Status**: done
- **Files**: `tools/scripts/lint/dependency-advisories.script.ts`, `tools/scripts/lint/dependency-advisories.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`lint:dependency-advisories` also reads every non-private `packages/*` and `plugins/*` manifest, takes the lowest version each `dependencies` and `peerDependencies` range admits (skipping `workspace:`), and asks the same advisory database for those versions; a floor with an advisory fails, naming the package, the manifest, the range, the advisory and the first version that clears it."
  - "Exceptions in `config/delendai/advisory-exceptions.json` apply to floors as they do to the lockfile; an audit that cannot reach the database fails, as today."
  - "A spec drives the floor check over fixture manifests and a fake advisory answer and asserts a vulnerable floor fails, a clean one passes, and a `workspace:` range is not asked about."
- shipped-in: `79cd050852df`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 65822541bff7, validate exit 0, tests 10/10; acceptance 3/3: (1) `lint:dependency-advisories` also reads every non-private `packages/*` and `plugins/*` manifest, takes the lowest version each `dependencies` and `peerDependen… (2) Exceptions in `config/delendai/advisory-exceptions.json` apply to floors as they do to the lockfile; an audit that cannot reach the database fails, as today. =… (3) A spec drives the floor check over fixture manifests and a fake advisory answer and asserts a vulnerable floor fails, a clean one passes, and a `workspace:` ra… — Read the delivering commit, the advisory script and its spec, the manifests, the dependency policy and the scaffold. Each clause is implemented and asserted by the named spec; the advisory lint ran here and exited 0 with 0 exceptions, and its spec ran 10 tests green.

### S2 — The two vulnerable floors are raised
- **Status**: done
- **Files**: `plugins/browser/package.json`, `bun.lock`, `docs/delendai/DEPENDENCY-VERSIONS.md`, `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/client/package.json`, `packages/core/package.json`, `packages/test-kit/package.json`, `plugins/adaptive-optimizer/package.json`, `plugins/agent-orchestrator/package.json`, `plugins/audit/package.json`, `plugins/auto-agent-selector/package.json`, `plugins/auto-plugin-selector/package.json`, `plugins/cache/package.json`, `plugins/commit-policy/package.json`, `plugins/completion/package.json`, `plugins/context-for-change/package.json`, `plugins/conventions/package.json`, `plugins/deps/package.json`, `plugins/diagram/package.json`, `plugins/docs/package.json`, `plugins/env/package.json`, `plugins/error-reporting/package.json`, `plugins/forge/package.json`, `plugins/framework-knowledge/package.json`, `plugins/git/package.json`, `plugins/i18n/package.json`, `plugins/impact-analysis/package.json`, `plugins/issues-triage/package.json`, `plugins/issues/package.json`, `plugins/link-check/package.json`, `plugins/logs/package.json`, `plugins/memory/package.json`, `plugins/notification/package.json`, `plugins/orchestrator-runner/package.json`, `plugins/perf/package.json`, `plugins/project-health/package.json`, `plugins/prompt-eval/package.json`, `plugins/proposals/package.json`, `plugins/quality-policy/package.json`, `plugins/quality/package.json`, `plugins/rules/package.json`, `plugins/search/package.json`, `plugins/security/package.json`, `plugins/self-learning/package.json`, `plugins/status-marker/package.json`, `plugins/tech-debt/package.json`, `plugins/test-convention/package.json`, `plugins/test-policy/package.json`, `plugins/usage-tracking/package.json`, `plugins/web-fetch/package.json`
- **Gate**: type
- acceptance:
  - "Every publishable manifest declares `@modelcontextprotocol/sdk` at `^1.32.0` or above, and `plugins/browser` declares `playwright` with a floor of at least 1.55.1; `lint:dependency-advisories` is green with no new exception."
  - "`bun install` leaves the lockfile resolving the same versions it resolved before, so nothing the tests ran against changes. The default range in `DEPENDENCY-VERSIONS.md`, which `lint:dependency-versions` holds every manifest to, and the three manifests the scaffold writes into an adopter's project carry the same `^1.32.0` floor."
- shipped-in: `68cfbe5427a7`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `lint:dependency-advisories` also reads every non-private `packages/*` and `plugins/*` manifest, takes the lowest version each `dependencies` and `peerDependencies` range admits (skipping `workspace:`), and asks the same advisory database for those versions; a floor with an advisory fails, naming the package, the manifest, the range, the advisory and the first version that clears it.
- Exceptions in `config/delendai/advisory-exceptions.json` apply to floors as they do to the lockfile; an audit that cannot reach the database fails, as today.
- A spec drives the floor check over fixture manifests and a fake advisory answer and asserts a vulnerable floor fails, a clean one passes, and a `workspace:` range is not asked about.
- Every publishable manifest declares `@modelcontextprotocol/sdk` at `^1.32.0` or above, and `plugins/browser` declares `playwright` with a floor of at least 1.55.1; `lint:dependency-advisories` is green with no new exception.
- `bun install` leaves the lockfile resolving the same versions it resolved before, so nothing the tests ran against changes. The default range in `DEPENDENCY-VERSIONS.md`, which `lint:dependency-versions` holds every manifest to, and the three manifests the scaffold writes into an adopter's project carry the same `^1.32.0` floor.
