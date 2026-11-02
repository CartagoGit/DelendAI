# project-kpis

S3 adds a durable history layer on top of the versioned snapshot contract from S1.

## History store

- Snapshots are written atomically to `CACHE_DIR/results/project-kpis/history.json`.
- The write path uses `withFileMutex` around the whole read-mutate-write cycle and `writeFileAtomic` for the final commit.
- Retention is day-based and configurable per write or read call. Old entries are pruned using `snapshot.generatedAt`, not guessed from file mtimes.

## Window reads and trends

- `readKpiHistoryWindow()` returns only the snapshots inside the requested `[from, to]` window or the equivalent `windowDays` range.
- `buildKpiTrendReport()` compares the oldest and newest numeric samples in that window and emits `up`, `down`, `stable` or `unknown`.
- Stability is configurable through absolute and percentage thresholds so tiny cost deltas do not read as false movement.

## Economics semantics

- Cost and savings evidence are persisted explicitly alongside each `IKpiSnapshot` entry.
- When the snapshot metric is `measured`, the history layer records `provider-reported`.
- When the snapshot metric is `estimated`, the history layer records `configured-estimate`.
- `subscription` is never inferred. It must be supplied explicitly when a flat plan exists but per-invocation attribution does not.
- Financial savings in USD are never invented. If no explicit baseline-backed evidence is supplied, the value stays `unavailable`.