---
id: x00933
title: "A published package cannot declare a range whose lowest version carries a known advisory"
kind: fix
status: ready
type: proposal
track: security
date: 2026-10-22
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
- **Status**: pending
- **Files**: `tools/scripts/lint/dependency-advisories.script.ts`, `tools/scripts/lint/dependency-advisories.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`lint:dependency-advisories` also reads every non-private `packages/*` and `plugins/*` manifest, takes the lowest version each `dependencies` and `peerDependencies` range admits (skipping `workspace:`), and asks the same advisory database for those versions; a floor with an advisory fails, naming the package, the manifest, the range, the advisory and the first version that clears it."
  - "Exceptions in `config/delendai/advisory-exceptions.json` apply to floors as they do to the lockfile; an audit that cannot reach the database fails, as today."
  - "A spec drives the floor check over fixture manifests and a fake advisory answer and asserts a vulnerable floor fails, a clean one passes, and a `workspace:` range is not asked about."

### S2 — The two vulnerable floors are raised
- **Status**: pending
- **Files**: `plugins/browser/package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "Every publishable manifest declares `@modelcontextprotocol/sdk` at `^1.32.0` or above, and `plugins/browser` declares `playwright` with a floor of at least 1.55.1; `lint:dependency-advisories` is green with no new exception."
  - "`bun install` leaves the lockfile resolving the same versions it resolved before, so nothing the tests ran against changes."

## acceptance

- `lint:dependency-advisories` also reads every non-private `packages/*` and `plugins/*` manifest, takes the lowest version each `dependencies` and `peerDependencies` range admits (skipping `workspace:`), and asks the same advisory database for those versions; a floor with an advisory fails, naming the package, the manifest, the range, the advisory and the first version that clears it.
- Exceptions in `config/delendai/advisory-exceptions.json` apply to floors as they do to the lockfile; an audit that cannot reach the database fails, as today.
- A spec drives the floor check over fixture manifests and a fake advisory answer and asserts a vulnerable floor fails, a clean one passes, and a `workspace:` range is not asked about.
- Every publishable manifest declares `@modelcontextprotocol/sdk` at `^1.32.0` or above, and `plugins/browser` declares `playwright` with a floor of at least 1.55.1; `lint:dependency-advisories` is green with no new exception.
- `bun install` leaves the lockfile resolving the same versions it resolved before, so nothing the tests ran against changes.
