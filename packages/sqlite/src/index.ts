/**
 * @delendai/sqlite — the one cross-runtime SQLite loader.
 *
 * Every delendai store that opens a SQLite database (proposals, telemetry,
 * evidence) resolves its driver here: `bun:sqlite` under Bun, `node:sqlite`
 * behind the same `Database` shape under Node.
 */
export { loadDatabaseClass } from './lib/load-database-class.helper';
export { NodeSqliteDatabase } from './lib/node-sqlite-database.helper';
