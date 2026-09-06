import { describe, expect, it } from 'vitest';

import {
	classifySqliteError,
	DEFAULT_SUPPORTED_SCHEMA_RANGE,
} from './error-method';

describe('classifySqliteError', () => {
	it.each([
		'SQLITE_CANTOPEN',
		'SQLITE_BUSY',
		'SQLITE_FULL',
		'SQLITE_IOERR',
	] as const)('maps SQLite open error %s', (code) => {
		expect(classifySqliteError({ kind: 'sqlite-open', code })).toEqual({ code });
	});

	it('maps schema-version mismatch with the observed version and supported range', () => {
		expect(
			classifySqliteError({
				kind: 'schema-version-mismatch',
				observedSchemaVersion: 7,
				supportedSchemaRange: { min: 1, max: 3 },
			}),
		).toEqual({
			code: 'SCHEMA_VERSION_UNSUPPORTED',
			pragma: 'user_version',
			supportedSchemaRange: { min: 1, max: 3 },
			observedSchemaVersion: 7,
		});
	});

	it('falls back to the default supported schema range when the wrapper omits it', () => {
		expect(
			classifySqliteError({
				observedSchemaVersion: 2,
				supportedSchemaRange: undefined,
			}),
		).toEqual({
			code: 'SCHEMA_VERSION_UNSUPPORTED',
			pragma: 'user_version',
			supportedSchemaRange: DEFAULT_SUPPORTED_SCHEMA_RANGE,
			observedSchemaVersion: 2,
		});
	});

	it('maps integrity-check failures to state-store corruption diagnostics', () => {
		expect(
			classifySqliteError({
				kind: 'integrity-check-failure',
				pragma: 'row 3 missing from index sqlite_autoindex_state_generations_1',
			}),
		).toEqual({
			code: 'INTEGRITY_CHECK_FAILED',
			pragma: 'row 3 missing from index sqlite_autoindex_state_generations_1',
		});
	});

	it('maps snapshot_json parse failures', () => {
		expect(
			classifySqliteError({
				kind: 'snapshot-json-parse-failure',
				cause: new SyntaxError('Unexpected token } in JSON at position 3'),
			}),
		).toEqual({
			code: 'SNAPSHOT_JSON_PARSE',
			pragma: 'snapshot_json',
		});
	});

	it('maps schema drift with an explicit missing column', () => {
		expect(
			classifySqliteError({
				kind: 'schema-drift',
				column: 'snapshot_json',
			}),
		).toEqual({
			code: 'SCHEMA_DRIFT',
			pragma: 'snapshot_json',
		});
	});

	it('infers the missing column from a raw SQLite error message', () => {
		expect(
			classifySqliteError(new Error('SQL error: no such column: reconciled_commit_sha')),
		).toEqual({
			code: 'SCHEMA_DRIFT',
			pragma: 'reconciled_commit_sha',
		});
	});

	it('maps WAL replay failures', () => {
		expect(
			classifySqliteError({
				kind: 'wal-replay-failure',
				pragma: 'wal_checkpoint(PASSIVE)',
			}),
		).toEqual({
			code: 'WAL_REPLAY_FAILED',
			pragma: 'wal_checkpoint(PASSIVE)',
		});
	});

	it('maps unknown failures to catch-all corruption diagnostics', () => {
		expect(classifySqliteError({ message: 'mystery failure' })).toEqual({
			code: 'UNKNOWN',
			pragma: 'mystery failure',
		});
	});
});