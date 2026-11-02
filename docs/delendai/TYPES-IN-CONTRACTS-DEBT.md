# Debt: exported types and constants outside contracts

## Snapshot

Measured on September 8, 2026 with `tools/scripts/lint/types-in-contracts.script.ts`.

The versioned baseline contains 1,020 files and 3,131 violations. A current
report sees 1,111 files and 3,515 violations because work landed after the
baseline was captured. The ratchet must reject this growth; this document does
not authorize a baseline update.

| Root | Files in baseline | Violations | Exported interfaces/types | Exported SCREAMING_SNAKE constants |
|---|---:|---:|---:|---:|
| `plugins` | 639 | 1,829 | 1,405 | 441 |
| `packages` | 277 | 963 | 752 | 154 |
| `apps` | 44 | 172 | 145 | 27 |
| `extensions` | 60 | 167 | 107 | 60 |
| **Total** | **1,020** | **3,131** | **2,409** | **682** |

The type/constant columns count matching exported declarations in the
baseline files. A file may contain both categories, so these columns are not
expected to sum to the file count or violation count exactly.

## Classification

### Mechanical migrations

These groups can be moved with low design risk when the exported declaration
already has a stable name and its imports are local:

- Move exported interfaces and type aliases into the nearest package
  `contracts/interfaces/` area and keep the `*.interface.ts` suffix where the
  file is a dedicated interface contract.
- Move exported durable `SCREAMING_SNAKE_CASE` constants into
  `contracts/constants/` and use the `*.constant.ts` suffix where the file is a
  dedicated constant contract.
- Update imports and public barrels in the same change.
- Leave tests, generated files, ambient declarations, and third-party
  re-exports under their existing exemptions.

The highest-volume mechanical pool is `plugins` (1,829 baseline violations),
followed by `packages` (963). Work should be split by package and keep one
package per slice so imports and public barrels remain reviewable.

### Design decisions required

Do not move a declaration mechanically when any of these apply:

- The declaration is part of a public package API whose path is consumed by
  another package or an external host.
- The name is an implementation detail but the file currently exports it for
  convenience; decide whether to make it private instead of relocating it.
- A constant is configuration, a registry entry, or a runtime value rather
  than a durable shared contract.
- Moving the declaration would create a dependency from `contracts/` back into
  services, tools, UI, or infrastructure.
- Multiple packages import the symbol through a barrel and the canonical
  ownership boundary is unclear.

These cases need a small design proposal before a `git mv`, especially in
`packages/contracts`, `packages/core`, `plugins/proposals`, and shared UI/data
modules.

## Package worklist

| Priority | Root | Baseline scope | First pass |
|---|---|---:|---|
| 1 | `plugins` | 1,829 violations / 639 files | Split by plugin; start with declarations that have no cross-package consumers. |
| 2 | `packages` | 963 violations / 277 files | Start with package-private declarations and preserve public barrels. |
| 3 | `apps` | 172 violations / 44 files | Migrate shared UI/data contracts after package ownership is settled. |
| 4 | `extensions` | 167 violations / 60 files | Migrate host-facing contracts only after extension API paths are checked. |

## Numeric target

The next cycle must reduce the versioned baseline by at least 157 violations,
which is 5% of 3,131 rounded up. The target is a baseline of at most 2,974
violations after the mechanical migrations land. No baseline increase is
allowed; the ratchet requires `--allow-baseline-growth --reason="..."` for an
exception and that exception must not be used to satisfy this target.

The first measurable checkpoint is one package-scoped slice that removes at
least 50 violations while keeping its package typecheck and the global
ratchet green. Subsequent slices should report both removed violations and
remaining design-decision cases.

## Validation

- `bun tools/scripts/lint/types-in-contracts.script.ts --report`
- `bun tools/scripts/lint/types-in-contracts.script.ts`
- The owning package typecheck and tests for every migration slice.
- `bun run validate` at the integration gate.

This inventory is a planning artifact. It does not move declarations or
change the ratchet baseline by itself.
