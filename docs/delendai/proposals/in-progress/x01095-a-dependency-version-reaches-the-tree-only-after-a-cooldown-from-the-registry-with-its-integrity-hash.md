---
id: x01095
title: "A dependency version reaches the tree only after a cooldown, from the registry, with its integrity hash"
kind: fix
status: in-progress
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: ecfcd912-d25e-46f3-b1fa-74f27e0aacaa
last-correlation-id: ecfcd912-d25e-46f3-b1fa-74f27e0aacaa
last-transition-from: ready
last-transition-at: 2026-11-18T08:07:00.467Z
---

# x01095 — A dependency version reaches the tree only after a cooldown, from the registry, with its integrity hash

## goal

No package version younger than three days is installed or proposed (bun install and Dependabot both wait), every lockfile entry resolves from the npm registry with an integrity hash, and a lint on every candidate refuses a lockfile that breaks either rule, so a freshly published malicious version cannot reach develop before the advisory databases know it.

## why

The supply-chain checks today catch what is already known: dependency-advisories.script.ts runs `bun audit` (which includes the registry's malware advisories) on every candidate, and only the four trustedDependencies may run install scripts. The usual malware vector is a compromised maintainer publishing a new version that is removed within hours to days; nothing here waits for that window: bunfig.toml sets no install.minimumReleaseAge, .github/dependabot.yml sets no cooldown, and no check reads a new lockfile entry's publish date or its source. Asked by the owner on 2026-11-18 as a light protection that does not touch the integrator.

## non-goals

- Scanning package contents or running a malware scanner.
- Changing the integrator, the queue or the promotion.
- Paid services or accounts.

## slices

- global_gate: lint

### S1 — bun and Dependabot wait three days for a new version
- **Status**: pending
- **Files**: `bunfig.toml`, `.github/dependabot.yml`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "bunfig.toml [install] sets minimumReleaseAge to 259200 seconds (3 days), with a comment naming this proposal's reason; `bun install --frozen-lockfile` still succeeds on the current lockfile."
  - "Every update block in .github/dependabot.yml sets `cooldown: default-days: 3`, and the github-actions ecosystem keeps SHA-pinned actions; `bun run lint:workflow-yaml` passes."

### S2 — A lint refuses a young, foreign-sourced or hashless lockfile entry
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:tools/scripts/lint/lockfile-provenance.script.ts`, `new:tools/scripts/lint/lockfile-provenance.script.spec.ts`, `new:config/delendai/lockfile-provenance-exceptions.json`, `package.json`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "`bun run lint:lockfile-provenance` reads bun.lock and fails, naming package and version, for an entry not resolved from the npm registry (git, http tarball, file outside the workspace) or without an integrity hash, unless config/delendai/lockfile-provenance-exceptions.json lists it with a reason and an until date; an expired exception fails like the entry; lockfile-provenance.script.spec.ts covers each case."
  - "For entries added or changed against the integration branch's lockfile, `bun run lint:lockfile-provenance` asks the registry's publish time and fails for a version younger than the cooldown in bunfig.toml (read from there, one source of truth); a registry that cannot be read fails the check, as dependency-advisories does; lockfile-provenance.script.spec.ts injects the registry read."
  - "`delendai work prove --only=lint-security` runs lint:lockfile-provenance beside dependency-advisories, so every proof and CI candidate runs it; it refuses an empty scan and states how many entries it read."
  - "lockfile-provenance.script.spec.ts drives it over fixture lockfiles: a clean one, a git-sourced entry, a hashless entry, a new entry published one hour ago (registry read injected), and an excepted entry, each with its own message."

## acceptance

- bunfig.toml [install] sets minimumReleaseAge to 259200 seconds (3 days), with a comment naming this proposal's reason; `bun install --frozen-lockfile` still succeeds on the current lockfile.
- Every update block in .github/dependabot.yml sets `cooldown: default-days: 3`, and the github-actions ecosystem keeps SHA-pinned actions.
- `bun run lint:workflow-yaml` (or the repo's YAML lint) passes on dependabot.yml.
- lint:lockfile-provenance reads bun.lock and fails, naming package and version, for an entry not resolved from the npm registry (git, http tarball, file outside the workspace) or without an integrity hash, unless config/delendai/lockfile-provenance-exceptions.json lists it with a reason and an until date; an expired exception fails like the entry.
- For entries added or changed against the integration branch's lockfile it asks the registry's publish time and fails for a version younger than the cooldown in bunfig.toml (read from there, one source of truth); a registry that cannot be read fails the check, as dependency-advisories does.
- It is wired into lint:security beside dependency-advisories so every proof and CI candidate runs it, refuses an empty scan, and states how many entries it read.
- The spec drives it over fixture lockfiles: a clean one, a git-sourced entry, a hashless entry, a new entry published one hour ago (registry read injected), and an excepted entry, each with its own message.
