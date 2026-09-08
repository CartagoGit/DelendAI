---
id: f00515
title: "Quarantine — corrupt proposals go to reconciliation_errors, never silently dropped"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-QUARANTINE-014
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00514
---

# f00515 — Quarantine

## Goal

Make "a proposal that can't be parsed / validated" a first-class,
recoverable state instead of either silently dropping it or, worse,
auto-creating a replacement. The audit summarises the goal:

> Si el reconciliador encuentra una proposal inválida no debería:
> ignorarla, ni importarla parcialmente, ni crear una nueva para
> sustituirla. Debe QUARANTINE. Por ejemplo: `reconciliation_errors`
> con `source_path`, `blob_sha`, `entity_guess`, `error_code`,
> `error_message`, `raw_metadata`, `run_id`. Y el run: `status =
> 'degraded'`. Así nunca pierdes conocimiento de que había una
> entidad.

## Why

The user-reported "propuestas corruptas que luego no es capaz de
cerrar" usually starts with a markdown file that the parser cannot
fully ingest. Today the proposals plugin silently drops the file or
fails the whole reconcile — both wrong. Quarantine is the third path:
the file is preserved verbatim, the system records it as broken, and
`db doctor` (f00518) can list it for manual or automatic repair.

This is also the precondition for the audit invariant #7: "ninguna
entidad inválida desaparece silenciosamente".

## Why this design

**`quarantine` table in the proposals DB.** Every reconcile failure
gets one entry with the full forensic record: source path, blob SHA,
parser output, error code, raw metadata, the run that produced it,
and a status (`pending` / `resolved` / `ignored`).

**Reconcile continues.** A single quarantine entry does NOT abort the
reconcile run; the run keeps going and records `status = 'degraded'`
only when at least one entry was quarantined. The audit trail is
preserved in both `reconciliation_runs` and `quarantine`.

**Repair tools (read side).** `proposals_db_quarantine_list` returns
the quarantine contents. `proposals_db_quarantine_repair` accepts a
manual fix (or a parse strategy change) and re-attempts the parse.
This is the only "delete the quarantine entry" path; nothing else
clears it.

**No auto-replace.** Quarantine NEVER produces a new proposal as a
replacement. The user (or an explicit automation rule) decides.

## non-goals

- Do NOT auto-fix quarantined proposals. The repair is an explicit,
  user-driven action.
- Do NOT delete quarantine entries from any other path.

## Slices

- global_gate: lint

### S1 — `quarantine` table + repository + reconciler integration

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/migrations/0005_quarantine_and_tombstones.sql`
    (existing migration — defines the quarantine table)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (modified —
    applies the existing quarantine migration)
  - `packages/proposals-sqlite/src/lib/repository/quarantine-repo.ts`
    (existing repository — records ingest entries and supports repair)
  - `packages/proposals-sqlite/src/lib/reconciler-staging.ts`
    (modified — records every parse or validation failure)
  - `packages/proposals-sqlite/tests/src/lib/repository/quarantine-repo.spec.ts`
    (new)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/quarantine.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `quarantine` schema: `(id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL, blob_sha TEXT NOT NULL,
    entity_guess TEXT, error_code TEXT NOT NULL, error_message TEXT
    NOT NULL, raw_metadata TEXT, run_id INTEGER REFERENCES
    reconciliation_runs(id), status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    resolved_at INTEGER, resolved_by TEXT, resolution_note TEXT)`.
  - Reconciler ingests a corrupt file, records a quarantine row,
    marks the run `status = 'degraded'`, and continues with the
    remaining files.
  - No quarantine row is ever written without a `run_id`.
  - `bun run typecheck` green.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada sobre c633c67be. La cuarentena conserva archivos corruptos, exige asociación con una ejecución de reconciliación y mantiene la FK a reconciliation_runs. Validación Bun: 3/3 pruebas, 11 expectativas; typecheck focalizado limpio.
### S2 — `proposals_db_quarantine_list` + `proposals_db_quarantine_repair` tools (read-only + explicit write)

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/tools/quarantine-list.tool.ts` (new)
  - `plugins/proposals/src/lib/tools/quarantine-repair.tool.ts` (new)
  - `plugins/proposals/tests/src/lib/tools/quarantine-list.tool.spec.ts`
    (new)
  - `plugins/proposals/tests/src/lib/tools/quarantine-repair.tool.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `proposals_db_quarantine_list` returns `{ entries: IQuarantineEntry[]
    , total: number, runCount: number }` and is read-only.
  - `proposals_db_quarantine_repair({ id, action: 're-parse' | 'mark-
    resolved' | 'mark-ignored', note })` re-runs the parser (with the
    current parser) or marks the row resolved/ignored with a note.
    It NEVER silently deletes.
  - The two tools share an `outputSchema` that downstream generators
    (apps/web, extensions/vscode) consume.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada sobre e5af10c83. Las herramientas SQLite listan y reparan entradas de cuarentena con acciones explícitas, comparten outputSchema y están registradas con disclosure administrativo. Validación Bun: 3/3 pruebas, 11 expectativas; typecheck focalizado limpio.
### S3 — Quarantine regression suite: a corrupt proposal is preserved, recorded, and recoverable

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`
  - `packages/proposals-sqlite/tests/e2e/quarantine.spec.ts` (new)
- **Gate**: e2e
- acceptance:
  - The fixture has 50 valid proposals + 1 corrupt proposal. After
    reconcile: 50 are inserted, 1 is in quarantine, the active DB is
    in a consistent state.
  - The e2e test then calls `proposals_db_quarantine_repair` with a
    fixed markdown blob and verifies the corrupt proposal becomes a
    regular proposal with the right `uid`.
  - A second e2e test verifies that a file absent from the reconcile
    input is not quarantined; tombstone classification is owned by
    `f00519` and remains a separate follow-up.

## acceptance

- All S1-S3 slices land.
- The audit invariant #7 ("ninguna entidad inválida desaparece
  silenciosamente") is demonstrably satisfied.
- Quarantine entries are never silently removed; only
  `proposals_db_quarantine_repair` clears them, with a note.

## notes

- The same table will eventually house "stale lock" or "broken
  reference" entries that today live in `agents.lock.json`; those are
  not in scope for this proposal but the schema is designed to host
  them later.
- Quarantine is the natural counterpart to `f00519` (tombstones): the
  two together cover all the "this entity went away" cases.