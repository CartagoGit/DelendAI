/**
 * @delendai/state-telemetry — Work Event Bus (q00020 F1).
 *
 * Public surface is intentionally empty in S1: this slice delivers the
 * bus, the `work_events` table and the SQLite/NDJSON facade, but does
 * not yet expose anything observable to other packages. F2-S5 owns the
 * `./public` barrel.
 */
export type { IWorkEvent, TWorkEventKind } from './lib/events/work-event';
