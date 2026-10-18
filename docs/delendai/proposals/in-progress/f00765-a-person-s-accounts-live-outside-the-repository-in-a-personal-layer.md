---
id: f00765
title: "A person's accounts live outside the repository, in a personal layer"
kind: feat
status: in-progress
type: proposal
track: batuta
date: 2026-10-18
parent: q00034
last-transition-id: 4500b9dc-5d4b-488a-96fd-9cf20748b8b0
last-correlation-id: 4500b9dc-5d4b-488a-96fd-9cf20748b8b0
last-transition-from: ready
last-transition-at: 2026-10-18T21:06:56.030Z
---

# f00765 — A person's accounts live outside the repository, in a personal layer

## goal

Each person keeps their own accounts for a project in a file of their own, outside the repository, which delendai merges over what the project shares by one rule; a project several people work on never holds one person's logins, and two people may use the same account differently (one through a plan, the other through a key). This is q00034 S1.

## why

`accounts` is read from the root of `delendai.config.json` (`packages/core/src/lib/plugins/load-config-file.ts:360`, validated by `account-registry.helper.ts`), with each account's `profileDir` and `credentialEnv`. That file is committed: whoever declares an account declares it for everyone, with their own profile directory in it, and nobody else can declare theirs differently. No personal configuration layer exists in delendai (the host-scope migrators handle the hosts' own files, not delendai's), so there is nowhere else to put it.

## non-goals

- Holding any credential: the personal layer, like the shared one, names a variable or a vendor profile directory, never a secret.
- Other personal settings: the layer is shaped to take them later, and takes only accounts and the provider fields that bind to them now.

## slices

- global_gate: type

### S1 — The personal layer and its place

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/personal-layer.service.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/tests/src/lib/plugins/personal-layer.service.spec.ts`, `packages/core/src/lib/platform/user-directories.helper.ts`, `packages/core/src/lib/work-identity/host-chat-model.helper.ts`, `tools/scripts/lint/platform-reads.baseline.json`
- **Gate**: type
- acceptance:
  - "A project's personal file is `<userConfigRoot>/delendai/projects/<key>.json`, where `<key>` is derived from the project's identity: the normalised fetch URL of its integration remote, or the real path of the workspace when it has none, so two clones of one repository share a person's accounts and two repositories never do. One helper answers the path; a spec holds a remote, no remote, and two clones."
  - "It holds `accounts` and, per provider id, the fields that bind a provider to an account (`accountId`), validated by the same schema as the shared file; it is read when the workspace configuration is read, and a missing file is an empty layer."

### S2 — One merge rule, told by `--check`

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/account-layers.interface.ts`, `packages/core/src/lib/cli/run-cli.ts`, `packages/core/tests/src/lib/plugins/load-config-file.spec.ts`
- **Gate**: type
- acceptance:
  - "Accounts merge by `accountId`: a personal entry replaces a shared one with the same id whole, so one person's plan and another's key never mix fields; a personal entry with a new id is added. The registry rules (`accountIssues`) run over the merged list."
  - "`delendai --check` names, for each account, the layer it came from (`shared` or `personal`) and the personal file's path, never its values beyond what it already shows for shared accounts. A spec holds a shared-only, a personal-only, an override and a duplicate across layers."

### S3 — The migration moves what is personal

- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/personal-accounts.migrator.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/personal-accounts.migrator.spec.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "A start-up migration finds accounts with a `profileDir` or `credentialEnv` in `delendai.config.json`, moves them to the running person's personal file, and leaves in the shared file only what the project agreed to share (an account a team declares with neither field stays). Journalled like every migration, written atomically, and run once; a spec holds the move, the stay, and a second run that does nothing."

## acceptance

- A person declares their accounts without touching a committed file, another person's accounts are never seen, and an account declared by the team can be overridden by one person alone.
