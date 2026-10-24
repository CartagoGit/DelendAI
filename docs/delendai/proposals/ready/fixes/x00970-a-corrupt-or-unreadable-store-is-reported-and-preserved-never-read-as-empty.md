---
id: x00970
title: "A corrupt or unreadable store is reported and preserved, never read as empty"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00970 — A corrupt or unreadable store is reported and preserved, never read as empty

## goal

Every JSON or JSONL store a plugin reads (KPI history, usage, memory, state, i18n catalogues, notifications, accounts, the model catalogue, the error stream) quarantines a corrupt file with its bytes, reports the skipped rows, and degrades the tool instead of throwing or silently answering from nothing.

## why

Joint audit a00095 and gpt-6.1-sol. D48: a corrupt history.json crashes project-kpis. D83/D75: usage-tracking presents complete totals after skipping corrupt rows. D90: memory's TTL sweep makes a corrupt store a silent no-op. D94: state-sqlite drops rows with an invalid scope instead of treating them as corruption. sol ACCOUNT-02: saving a learned classification overwrites an unreadable history. sol ACCOUNT-03: a malformed model catalogue cache aborts account gathering. sol G61-I18N-01: a corrupt catalogue disappears and the base language changes. sol USAGE-01: successful issue collections are persisted as schema incongruences. D82/D73: the notification watcher emits false lock-released when the lock file cannot be read. G62: a deterministic ENOENT of the error stream mutex sidecar.

## non-goals

- Reads of external commands (the failures-reads proposal).

## slices

- global_gate: type

### S1 — project-kpis and usage-tracking
- **Status**: pending
- **Files**: `plugins/project-kpis/src/lib/services/kpi-history.service.ts`, `plugins/project-kpis/tests/src/kpi-history.spec.ts`, `plugins/usage-tracking/src/lib/rollup.ts`, `plugins/usage-tracking/src/lib/host-lifecycle.ts`, `plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts`, `plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/issues/src/lib/tools/list-issues.tool.ts`
- **Gate**: type
- acceptance:
  - "A corrupt history is quarantined and the tool answers with a degraded flag (D48)."
  - "Rollups report how many rows they skipped (D83, D75)."
  - "A successful issue collection is not recorded as a schema incongruence (USAGE-01)."

### S2 — memory, state and i18n
- **Status**: pending
- **Files**: `plugins/memory/src/lib/services/store-io.ts`, `plugins/memory/src/lib/services/store-records.ts`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `plugins/i18n/src/lib/i18n/real-deps.ts`, `plugins/i18n/src/lib/tools/i18n-validate.tool.ts`
- **Gate**: type
- acceptance:
  - "A corrupt memory store fails the sweep with the reason and keeps the file (D90)."
  - "An invalid persisted scope is reported as corruption (D94)."
  - "A corrupt catalogue is an error naming the file; the base language does not change (G61-I18N-01)."

### S3 — accounts and the model catalogue
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/learned-accounts.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/cli/src/commands/accounts.command.ts`
- **Gate**: type
- acceptance:
  - "An unreadable history is preserved aside before a save (ACCOUNT-02)."
  - "A malformed catalogue cache, null fields included, degrades to no catalogue (ACCOUNT-03)."

### S4 — notification and the error stream
- **Status**: pending
- **Files**: `plugins/notification/src/lib/services/watcher.ts`, `plugins/notification/src/lib/tools/tools.ts`, `plugins/logs/src/index.ts`
- **Gate**: type
- acceptance:
  - "An unreadable lock file is not a release; await_lock keeps waiting and reports the read error (D82, D73)."
  - "The error stream creates its mutex sidecar directory before locking; no ENOENT at start-up (G62)."

## acceptance

- A corrupt history is quarantined and the tool answers with a degraded flag (D48).
- Rollups report how many rows they skipped (D83, D75).
- A successful issue collection is not recorded as a schema incongruence (USAGE-01).
- A corrupt memory store fails the sweep with the reason and keeps the file (D90).
- An invalid persisted scope is reported as corruption (D94).
- A corrupt catalogue is an error naming the file; the base language does not change (G61-I18N-01).
- An unreadable history is preserved aside before a save (ACCOUNT-02).
- A malformed catalogue cache, null fields included, degrades to no catalogue (ACCOUNT-03).
- An unreadable lock file is not a release; await_lock keeps waiting and reports the read error (D82, D73).
- The error stream creates its mutex sidecar directory before locking; no ENOENT at start-up (G62).
