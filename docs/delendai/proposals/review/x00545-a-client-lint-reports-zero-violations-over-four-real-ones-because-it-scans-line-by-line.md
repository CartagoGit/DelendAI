---
id: x00545
title: "A client lint reports zero violations over four real ones because it scans line by line"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-17
tags:
    - lint
    - gates
    - test-fidelity
    - contracts
---

# x00545 — A client lint reports zero violations over four real ones because it scans line by line

## goal

`lint:no-core-public-types-in-client` must be able to fail. Its green
must mean "the client takes no types from `@delendai/core/public`", not
"the regex could not reach them".

## why

Found on develop at `53ec2500c` while measuring f00549 S4, which needed
the enforcing lints as ground truth and therefore had to check whether
they were telling the truth.

`bun run lint:no-core-public-types-in-client` prints
`0 violations across 53 file(s)`. Four files inside that scanned set
hold exactly the import it forbids:

    packages/client/src/node/scaffold/project-plugins.ts:18
    packages/client/src/node/scaffold/write-scaffolded-files.ts:21
    packages/client/src/node/services/plugin-activation.service.ts:9
    packages/client/src/lib/services/agent-catalog-service.ts:1

The mechanism: `lintOne` split the file with `text.split('\n')` and ran
`TYPE_IMPORT.exec(line)` once per line. That pattern needs `import type
{`, the specifiers and `from '…'` on a single line. This repo wraps
import specifiers across lines, so the rule could not see its own
subject. Measured directly: `per-line=False whole-file=True` on the
same source.

The lint also shipped with **no spec**, which is why the blind spot
survived. It is cited in `ci.yml:138` and in `validate:run`, so it has
been standing evidence for a claim it never checked.

This is the same failure class as x00543's marginal ceiling and #235's
schema test that never called `listTools()`: a gate whose green is
structurally guaranteed. Those are worse than a missing gate, because
they are quoted as proof.

### Why the lint could not simply be fixed

Fixing the regex alone turns `lint-presets` and CI red, because the four
violations become visible. Migrating them was not possible either: of
the eleven symbols involved, only `PluginOrigin` and
`IDelendaiToolOutputs` were reachable from `@delendai/core/contracts`.
The rule forbade a route and offered an alternative that did not exist.

Of the nine missing symbols, seven re-export cleanly. The four batch
types do not: they were declared beside the implementation in
`lib/shared/batch-atomic-writer.ts`, which imports `node:fs/promises`,
and re-exporting a type from an implementation module makes TypeScript
type-check that module — `lint:core-contracts-library-safe` fails with
28 errors across `atomic-write.ts`, `batch-atomic-writer.ts` and
`with-file-mutex.ts`. Measured, not predicted: a static reading had
wrongly expected `scaffold-host.ts` to fail too, and it does not,
because `import type` is erased.

## non-goals

- **No `@types/node` in `tsconfig.contracts-library-safe.json`.** That
  removes the gate instead of satisfying it, as its own error says.
- **No baseline or allowlist for the four violations.** They are real
  and they migrate.
- **No widening of `@delendai/core/public`.** The surface budget is at
  `1076/1076`; this proposal adds nothing to it. The contracts barrel is
  a different file and is not counted by that gate.

## slices

### S1 — Give the rule a destination, and move the client onto it

The alternative the lint names must exist before the lint can demand it.

- **Status**: done — the four batch contract types moved as a set into
  `packages/core/src/lib/contracts/interfaces/batch-atomic-writer.interface.ts`;
  they reference each other (`IBatchAtomicWriter` returns
  `IBatchWriteResult`, which carries `IBatchOperationError`), so moving
  a subset would leave the new module importing the remainder back from
  the implementation and re-drag `node:fs`. The implementation
  re-exports all four, so every existing importer is untouched. The
  contracts barrel gained eleven type re-exports, and the four client
  files now import from `@delendai/core/contracts`.
- **Files**: [`packages/core/src/lib/contracts/interfaces/batch-atomic-writer.interface.ts`, `packages/core/src/lib/shared/batch-atomic-writer.ts`, `packages/core/src/contracts/index.ts`, `packages/client/src/node/scaffold/project-plugins.ts`, `packages/client/src/node/scaffold/write-scaffolded-files.ts`, `packages/client/src/node/services/plugin-activation.service.ts`, `packages/client/src/lib/services/agent-catalog-service.ts`]
- **Gate**: `bun run lint:core-contracts-library-safe && bun run typecheck`

### S2 — Make the lint able to fail, and pin that it can

- **Status**: done — the scan is over the whole file with comments
  blanked (newlines preserved, so line numbers stay true) and each
  finding attributed to the line its `import` starts on. `findViolations`
  is exported as the pure half so the spec drives source text rather
  than whatever happens to sit in `packages/client` today. Fourteen
  cases, including the wrapped-import regression pin, the
  value-import and `@delendai/core/contracts` negatives, comment
  handling, and `@delendai/core-extras` as a non-match.
- **Files**: [`tools/scripts/lint/no-core-public-types-in-client.script.ts`, `tools/scripts/lint/no-core-public-types-in-client.script.spec.ts`]
- **Gate**: `npx vitest run --project tools tools/scripts/lint/no-core-public-types-in-client.script.spec.ts && bun run lint:no-core-public-types-in-client`

## acceptance

- The spec fails if the per-line scan is restored.
- `lint:no-core-public-types-in-client` exits 0 over the migrated tree,
  and exits 1 if any of the four imports is reverted to
  `@delendai/core/public`.
- `lint:core-contracts-library-safe` stays green.
- `lint:core-public-surface-budget` is unchanged at `1076`.
