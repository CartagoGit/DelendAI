/**
 * schema-guard.service.spec.ts — a build never writes a database a newer
 * build wrote.
 */
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from './db-path.ts';
import { currentSchemaVersion } from './migrations.ts';
import { PROPOSALS_SQLITE_SCHEMA_VERSION } from './schema.ts';
import {
	describeSchemaAhead,
	readSchemaAhead,
	SchemaAheadOfRuntimeError,
} from './schema-guard.service.ts';
import { ProposalsSqliteDriver } from './sqlite-driver.ts';
import { openStartupStatePorts } from './work-model/startup-state-ports.ts';

const FUTURE_VERSION = PROPOSALS_SQLITE_SCHEMA_VERSION + 1;

/** An up-to-date database a later build then migrated one step further. */
const writeFutureDatabase = (path: string): void => {
	new ProposalsSqliteDriver({ path }).close();
	const db = new Database(path);
	db.prepare(
		'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
	).run(FUTURE_VERSION, 'from_a_newer_build.sql', 'unknown-here', 0);
	db.close();
};

describe('a database a newer build wrote', () => {
	let dir: string;
	let path: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'schema-guard-'));
		path = resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath;
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('is nothing to report when the database is fresh or current', () => {
		const driver = new ProposalsSqliteDriver({ path });
		try {
			expect(readSchemaAhead(driver.handle)).toBeNull();
		} finally {
			driver.close();
		}
		new ProposalsSqliteDriver({ path }).close();
	});

	it('is refused for writing, and left exactly as it was', () => {
		writeFutureDatabase(path);

		expect(() => new ProposalsSqliteDriver({ path })).toThrow(
			SchemaAheadOfRuntimeError,
		);

		const after = new Database(path, { readonly: true });
		try {
			expect(currentSchemaVersion(after)).toBe(FUTURE_VERSION);
		} finally {
			after.close();
		}
	});

	it('is still readable: the diagnostic handle is not blinded', () => {
		writeFutureDatabase(path);
		const driver = new ProposalsSqliteDriver({ path, readonly: true });
		try {
			expect(readSchemaAhead(driver.handle)).toEqual({
				databaseVersion: FUTURE_VERSION,
				runtimeVersion: PROPOSALS_SQLITE_SCHEMA_VERSION,
			});
		} finally {
			driver.close();
		}
	});

	it('binds no startup port, and says which build to install', () => {
		writeFutureDatabase(path);
		const opened = openStartupStatePorts({
			databasePath: path,
			allowCreate: true,
		});
		expect(opened.kind).toBe('unreadable');
		if (opened.kind !== 'unreadable') return;
		expect(opened.reason).toBe(
			describeSchemaAhead(
				{
					databaseVersion: FUTURE_VERSION,
					runtimeVersion: PROPOSALS_SQLITE_SCHEMA_VERSION,
				},
				path,
			),
		);
		expect(opened.reason).toContain('NEWER delendai');
	});
});
