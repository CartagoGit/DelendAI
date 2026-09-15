---
id: f00540
title: "Git host provider abstraction with capability flags"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00540 — Git host provider abstraction with capability flags

## Goal

Decouple every delendai consumer (auto_work, commit-policy, status-marker, changelog) from the concrete notion of GitHub vs GitLab vs Bitbucket by introducing an IGitHostProvider contract with a registry, capability flags, autodetect, and a conformance suite. Refactor existing plugins/github and plugins/gitlab into adapters implementing the contract; new hosts (Bitbucket, Gitea, Forgejo) can be added without touching consumers.

## why

Today plugins/github has ~2900 LOC and plugins/gitlab ~1600 LOC. The asymmetry means GitLab only covers what dogfooding needed; every consumer that branched off dogfooding (auto_work, status-marker, changelog) is implicitly coupled to GitHub semantics. Migrating to GitLab self-hosted or Bitbucket Cloud requires refactoring each consumer. A registry + capability flags abstraction lets N consumers use M providers as N+M rather than N×M.

## non-goals

- Not implementing Bitbucket, Gitea, Forgejo, Azure DevOps — only contract + stubs via P3.
- Not introducing an abstract class hierarchy; capability flags only.
- Not migrating the existing github or gitlab consumers beyond their plugin boundaries; backcompat wrappers for one release.
- Not adding a UI layer for capability fallback; only structured tool errors with actionable alternatives.

## Slices

- global_gate: type

### S1 — IGitHostProvider contract and types
- **Status**: pending
- **Files**: `plugins/git-host/contract.ts`, `plugins/git-host/types.ts`, `plugins/git-host/package.json`
- **Gate**: type
- acceptance:
  - "Contract exposes id, label, baseUrl, capabilities(), detect, getVisibility, getAuthContext, openPullRequest, mergePullRequest, getPullRequest, listCheckRuns, pushBranch, ensureBranchProtection, resolveRunnerTopology."
  - "Capability flags are an exported union literal type."
  - "No leakage of GitHub or GitLab specific types into the contract."

### S2 — Registry and autodetect
- **Status**: pending
- **Files**: `plugins/git-host/registry.ts`, `plugins/git-host/detect.ts`, `plugins/git-host/tests/registry.spec.ts`, `plugins/git-host/tests/detect.spec.ts`
- **Gate**: type
- acceptance:
  - "Registry exposes resolve(config) that returns an IGitHostProvider."
  - "autodetect walks github, gitlab, bitbucket detect implementations and picks highest confidence > 0.5."
  - "baseUrl override forces self-hosted variant when present."
  - "Errors list which providers were tried when none claims the remote URL."

### S3 — Refactor plugins/github as adapter
- **Status**: pending
- **Files**: `plugins/github/src/adapter.ts`, `plugins/github/src/index.ts`, `plugins/github/tests/adapter.spec.ts`
- **Gate**: type
- acceptance:
  - "plugin-github exports an IGitHostProvider implementation."
  - "Existing exports are kept as deprecation re-exports for one release."
  - "Capabilities() reflect the GitHub.com or Enterprise variant."

### S4 — Refactor plugins/gitlab as adapter
- **Status**: pending
- **Files**: `plugins/gitlab/src/adapter.ts`, `plugins/gitlab/src/index.ts`, `plugins/gitlab/tests/adapter.spec.ts`
- **Gate**: type
- acceptance:
  - "plugin-gitlab exports an IGitHostProvider implementation."
  - "MR semantics (merge commit message, draft MR, MR templates) are mapped onto the contract OpenPRInput and MergePRInput."
  - "Backcompat re-exports for one release."

### S5 — Capability gating helpers
- **Status**: pending
- **Files**: `plugins/git-host/capability-gate.ts`, `plugins/git-host/tests/capability-gate.spec.ts`
- **Gate**: type
- acceptance:
  - "host.requires(cap) helper throws a typed error mentioning missing capability and supported alternatives."
  - "Cached per provider id + version for 5 minutes."
  - "Caller can request degrade: true to receive a soft warning instead of throw."

### S6 — Migrate consumers to use the registry
- **Status**: pending
- **Files**: `plugins/proposals/src/tools/auto-work.tool.ts`, `plugins/commit-policy/src/policy/...`, `plugins/status-marker/src/...`, `plugins/changelog/src/...`, `plugins/proposals/tests/host/consumers-use-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "No consumer imports directly from @delendai/plugin-github or @delendai/plugin-gitlab."
  - "Each consumer resolves the host via GitHostRegistry.resolve(config)."
  - "Capability gating applied where a feature is optional (merge strategy, draft PR, etc.)."

### S7 — Conformance suite with shared fixture
- **Status**: pending
- **Files**: `plugins/git-host/tests/conformance.spec.ts`, `plugins/git-host/tests/fixtures.ts`
- **Gate**: type
- acceptance:
  - "Same fixture test runs against both GitHub and GitLab adapters."
  - "Failures are reported per adapter with capability name."
  - "Adding a new adapter wires it into the conformance suite with one registration call."

### S8 — Documentation and authoring guide
- **Status**: pending
- **Files**: `docs/delendai/git-host-providers.md`, `docs/delendai/authoring-git-host-adapter.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "git-host-providers.md includes a capability matrix for github, gitlab, bitbucket, gitea."
  - "authoring-git-host-adapter.md walks through adding a new host in under 4 hours of work."
  - "CHANGELOG entry marks the deprecation of direct github and gitlab imports."

## acceptance

- Contract exposes id, label, baseUrl, capabilities(), detect, getVisibility, getAuthContext, openPullRequest, mergePullRequest, getPullRequest, listCheckRuns, pushBranch, ensureBranchProtection, resolveRunnerTopology.
- Capability flags are an exported union literal type.
- No leakage of GitHub or GitLab specific types into the contract.
- Registry exposes resolve(config) that returns an IGitHostProvider.
- autodetect walks github, gitlab, bitbucket detect implementations and picks highest confidence > 0.5.
- baseUrl override forces self-hosted variant when present.
- Errors list which providers were tried when none claims the remote URL.
- plugin-github exports an IGitHostProvider implementation.
- Existing exports are kept as deprecation re-exports for one release.
- Capabilities() reflect the GitHub.com or Enterprise variant.
- plugin-gitlab exports an IGitHostProvider implementation.
- MR semantics (merge commit message, draft MR, MR templates) are mapped onto the contract OpenPRInput and MergePRInput.
- Backcompat re-exports for one release.
- host.requires(cap) helper throws a typed error mentioning missing capability and supported alternatives.
- Cached per provider id + version for 5 minutes.
- Caller can request degrade: true to receive a soft warning instead of throw.
- No consumer imports directly from @delendai/plugin-github or @delendai/plugin-gitlab.
- Each consumer resolves the host via GitHostRegistry.resolve(config).
- Capability gating applied where a feature is optional (merge strategy, draft PR, etc.).
- Same fixture test runs against both GitHub and GitLab adapters.
- Failures are reported per adapter with capability name.
- Adding a new adapter wires it into the conformance suite with one registration call.
- git-host-providers.md includes a capability matrix for github, gitlab, bitbucket, gitea.
- authoring-git-host-adapter.md walks through adding a new host in under 4 hours of work.
- CHANGELOG entry marks the deprecation of direct github and gitlab imports.
