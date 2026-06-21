---
id: f00048
status: ready
type: proposal
track: architecture+lint+repo-layout
date: 2026-06-21
kind: feat
title: Contract folders and canonical file suffixes for interfaces, constants, services, tools and registrars
shipped-in: []
related:
    - f00032
    - a00027
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00048 — Contract folders and canonical file suffixes

## goal

Make the repository's file layout predictable enough that any agent,
IDE, or human can infer what a file contains from its path and suffix.
The target convention is:

- Interfaces and exported structural types live under
  `contracts/interfaces/` and use `*.interface.ts`.
- Constants live under `contracts/constants/` and use `*.constant.ts`.
- Services use `*.service.ts` under a `services/` folder.
- Tools use `*.tool.ts` under a `tools/` folder.
- Registrars/builders use explicit suffixes such as `*.register.ts`,
  `*.registry.ts`, `*.builder.ts`, or `*.factory.ts` under matching
  folders.

The convention applies to packages, plugins, extensions, apps, examples
and tools, with documented exceptions for generated files and public
barrels.

## why

The repo currently mixes names such as `search-service.ts`,
`tool-descriptor.types.ts`, `proposal-glossary.constant.ts`, generated
output files, and local helper names. That makes refactors and agent
navigation more expensive than necessary.

This project is infrastructure for agents. Naming must be mechanical:
`foo.service.ts` should mean service, `foo.interface.ts` should mean
contract type/interface, and durable constants should be grouped under a
constants contract folder. This reduces search scope, helps lint rules
stay simple, and prevents agents from inventing local mini-conventions.

## why this design

The suffix is singular because it describes the file role, while the
folder is plural because it groups many contracts:

| Role | Folder | Suffix |
|---|---|---|
| interfaces/types | `contracts/interfaces/` | `*.interface.ts` |
| constants | `contracts/constants/` | `*.constant.ts` |
| services | `services/` | `*.service.ts` |
| MCP tools | `tools/` | `*.tool.ts` |
| registries | `registries/` or `registry/` | `*.registry.ts` |
| registration glue | `register/` or local feature folder | `*.register.ts` |
| factories | `factories/` | `*.factory.ts` |
| builders | `builders/` | `*.builder.ts` |
| generated outputs | `generated/` | documented generator-owned suffix |

The migration must be incremental. A single repo-wide rename would create
high conflict risk and obscure behavior changes. Instead, this proposal
adds a convention document and drift linter first, then migrates one
package/plugin family at a time.

## non-goals

- No semantic rewrite of services or tools just to rename files.
- No moving generated files unless the generator is updated in the same
  slice.
- No changing public API exports without compatibility aliases.
- No touching active proposal/audit files owned by another agent.
- No forcing `index.ts` public barrels to carry a role suffix.

## architecture

Add a pure naming classifier that maps a relative path to one of:

- `interface`
- `constant`
- `service`
- `tool`
- `registry`
- `register`
- `factory`
- `builder`
- `generated`
- `barrel`
- `other`

The classifier feeds a new lint script in `tools/scripts/lint/` and a
documentation page in `docs/`. The linter initially runs in report mode
for legacy paths, then becomes strict for newly touched files.

Migration slices should use `git mv`, update imports mechanically, and
run package-level tests before full `bun run validate`.

## slices

### S1 — Document the convention and add the classifier

- **Status**: pending
- **Files**:
  - `docs/FILE-CONVENTIONS.md`
  - `tools/scripts/lint/file-conventions.ts`
  - `tools/scripts/lint/file-conventions.script.ts`
  - `tools/scripts/lint/file-conventions.script.spec.ts`
- **Gate**: `bun run test tools/scripts/lint/file-conventions.script.spec.ts`

### S2 — Wire report-mode lint and baseline

- **Status**: pending
- **Files**:
  - `package.json`
  - `docs/FILE-CONVENTIONS.md`
  - `tools/scripts/lint/file-conventions.script.ts`
- **Gate**: `bun run lint:file-conventions`

### S3 — Migrate `packages/client` services and contracts

- **Status**: pending
- **Files**:
  - `packages/client/src/lib/services/**`
  - `packages/client/src/lib/contracts/interfaces/**`
  - `packages/client/src/lib/contracts/constants/**`
  - `packages/client/tests/**`
  - `packages/client/src/public/index.ts`
- **Gate**: `bun run test packages/client && bun run typecheck`

### S4 — Migrate `packages/ui-extension` services/render contracts

- **Status**: pending
- **Files**:
  - `packages/ui-extension/src/**`
  - `packages/ui-extension/tests/**`
  - `packages/ui-extension/src/public/index.ts`
- **Gate**: `bun run test packages/ui-extension && bun run typecheck`

### S5 — Migrate plugins by family

- **Status**: pending
- **Files**:
  - `plugins/*/src/lib/**`
  - `plugins/*/tests/**`
  - plugin public barrels
- **Gate**: `bun run test plugins && bun run typecheck`

### S6 — Make the linter strict for non-generated files

- **Status**: pending
- **Files**:
  - `tools/scripts/lint/file-conventions.script.ts`
  - `package.json`
  - `docs/FILE-CONVENTIONS.md`
- **Gate**: `bun run validate`

## acceptance

- [ ] `docs/FILE-CONVENTIONS.md` documents every suffix and folder rule.
- [ ] New linter reports legacy drift with actionable paths.
- [ ] Migrated files use dot suffixes, not hyphen suffixes
  (`*.service.ts`, not `*-service.ts`).
- [ ] Interfaces/types and constants move under
  `contracts/interfaces/` and `contracts/constants/`.
- [ ] Generated files and public barrels have explicit exceptions.
- [ ] `bun run validate` is green.

## risks and mitigations

- **Import churn**: use `git mv` and migrate by package family.
- **Generated drift**: update generators in the same slice that moves
  generated outputs.
- **Concurrent proposal work**: avoid broad `docs/proposals/**` edits
  while audits are active.
- **Over-strict naming**: start report-mode, then strict mode after
  migrations are complete.

## notes

This proposal intentionally separates naming/layout from behavior. Any
behavioral SOLID refactor discovered during migration should become a
separate proposal unless it is required to keep the move compiling.
