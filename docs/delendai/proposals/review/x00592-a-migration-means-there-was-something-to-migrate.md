---
id: x00592
title: "A migration means there was something to migrate"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - migration
    - adoption
    - safety
---

# x00592 — A migration means there was something to migrate

## goal

The `mcp-vertex → delendai` migration runs on the projects it was written
for, and on no others.

## why

From a server log in an unrelated project:

```
[delendai] migrated: delendaiToDelendAI:v1
[delendai] migrated: cacheAndDocsMigrator:v1
[delendai] migrated: configFileMigrator:v1
[delendai] migrated: packageManifestMigrator:v1
[delendai] migrated: hostConfigMigrator:v1
[delendai] migrated: agentFilesMigrator:v1
```

Six migrations, on every boot, in a project that has never seen
`mcp-vertex`. Meanwhile a project that **is** still on `mcp-vertex` gets
none of them. Both halves have the same shape: the engine was asking the
wrong question, in four different places.

### 1. `detect` answers a question one step short

Every migrator probes for the file it *owns*:

```ts
detect: async (ctx) => pathExists(absoluteConfigPath(ctx)),   // config-file
detect: async (ctx) => pathExists(absoluteHostConfigPath(ctx)), // host-config
```

An adopted project has those files by definition. "The file I rewrite
exists" is not "the file needs rewriting", so every migrator detected,
applied a no-op, and got **recorded** — six lines of `migrated:` and a
journal write that conjured `.delendai/` into a tree with no reason to
grow one.

`plan` already answers the real question, uniformly, and it is what
`--dry-run` has always been trusted to print.

### 2. The rename table renamed paths onto themselves

```ts
{ from: 'delendai.config.json', to: 'delendai.config.json', … }
{ from: '.cache/delendai',      to: '.cache/delendai',      … }
{ from: 'docs/delendai',        to: 'docs/delendai',        … }
```

`from` identical to `to`, in **both** copies of the table, from the commit
that introduced them. A global rename of the product's name swept the
source and rewrote the legacy spellings inside these tables along with
everything else — and this table is the one place in the repository where
the old name is the *payload* rather than a stale reference.

So `cacheAndDocsMigrator` has never migrated anything. It detected the new
name, planned a move of a path onto itself, and reported itself done.

The specs did not catch it because they asserted the flattened table
verbatim and built their fixtures out of it — `await writeFile(join(root,
'delendai.config.json'))`, commented "drop a legacy sentinel". They were
pinning the bug.

### 3. Two tables that had to agree

`delendai-to-delendai-v1.ts` and `cache-and-docs.migrator.ts` each held
their own copy of the same three renames, and both were wrong the same
way. Two tables that must agree are two chances to disagree.

### 4. The adoption gate locked out the only projects that qualify

`ADOPTION_MARKERS` listed `delendai.config.json` and `.delendai`. A
project still on `mcp-vertex` has neither — it has
`mcp-vertex.config.json`. x00585 correctly stopped the engine touching
strangers' repositories, and in doing so it classified every unmigrated
workspace as a stranger.

Each of these alone was enough to make the migration useless. Together
they meant it ran on every project *except* the ones it exists for.

## non-goals

- Reinstating writes into a project that has not adopted anything.
  x00585's gate stays; it is widened by exactly the set of workspaces
  that adopted this product under its previous name.
- The `.delendai/applied-config.json` snapshot that
  `reconcileConfigTransitions` writes on first sight. It is a fourth
  writer with the same smell — unreported, in a directory the project
  did not ask for — and it needs its own slice, not a rider on this one.

## architecture

**The engine asks `plan`.** A migration that plans no steps does not
apply, is not recorded, and is not reported. That fixes all six migrators
at once rather than six times, and keeps the answer where the migrator
contract already put it. Nothing is recorded, deliberately: there is
nothing to be idempotent about, and the next boot re-probes for the price
of the same reads. `--dry-run` is unchanged — an empty plan is a
legitimate answer to "what would you do?", and the operator asked.

**The rename table names the old spellings again**, and there is one of
it: `DELENDAI_TO_DELENDAI_V1_RENAMES` is derived from
`DEFAULT_CACHE_AND_DOCS_RENAMES`.

**The markers are read from that table.** Whatever the migrator knows how
to migrate *from* is, by construction, a workspace this product may heal.

## slices

### S1 — a migration that plans nothing does nothing

- **Status**: review
- **Files**: [`packages/core/src/lib/workspace-migration/legacy-migration.service.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/workspace-migration/`

### S2 — the renames are real renames, from one table

- **Status**: review
- **Files**: [`packages/core/src/lib/workspace-migration/migrators/cache-and-docs.migrator.ts`, `packages/core/src/lib/workspace-migration/migrations/delendai-to-delendai-v1.ts`, `packages/core/src/lib/workspace-migration/legacy-migration.constant.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/cache-and-docs.migrator.spec.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`]
- **Gate**: `npx vitest run --project core`

### S3 — the measurement harness disposes what it started

- **Status**: review
- **Files**: [`tools/scripts/report/token-budget-report-lib.ts`]
- **Gate**: `npx vitest run --project tools`

## acceptance

- A migration whose `plan` is empty is not applied, not recorded, and
  not reported; one whose plan is non-empty still runs.
- The real registry over an adopted project with nothing legacy in it
  reports `not-needed`, calls no reporter, and leaves that project's
  config, manifest and host configuration byte-identical.
- Every rename has `from !== to`, `from` carrying the old name and `to`
  not.
- A project still on `mcp-vertex` is recognised as adopted, and one run
  moves `mcp-vertex.config.json`, `.cache/mcp-vertex` and
  `docs/mcp-vertex` to their new names **with their contents intact**.
- A project with only a `package.json` is still a stranger.

### the fixture is disposed before it is deleted

CI refused this branch on an unrelated file:

```
FAIL tools scripts/report/token-budget-dashboard.spec.ts
  Error: ENOTEMPTY: directory not empty,
         rmdir '/tmp/tok-report-E4xWN8/.cache/delendai'
```

It reads as a flake. It is not one. `connectTokenBudgetClient` closed the
client and the server and stopped there — closing a server ends the
conversation, it does not stop the work the plugins started. Their
listeners and interval timers kept running, and several of them write
into the fixture's `.cache/delendai`, which the caller deletes the moment
the last measurement returns. A recursive delete was losing a race with a
timer nobody had stopped, four times per preset.

`createMcpProject` has always returned a `dispose()` that drains
in-flight work and tears the plugins down. The harness never called it.
It does now.

The failure is a race, and no test here reproduces it on demand; what is
fixed is the leak that makes the race possible.

## risks and mitigations

- **A migrator whose `plan` under-reports what `apply` does** would now be
  skipped. That asymmetry was always a bug — `--dry-run` printed the same
  lie — and the two are written together in every migrator here.
- **The widened marker list.** It grows by exactly the three paths the
  rename table already names, so a directory qualifies only if it
  contains something this product itself created under its old name.

## notes

The invariant that would have caught the flattened table is now a test:
a rename whose source equals its destination is not a rename. A future
sweep of the product's name across the source trips over it.
