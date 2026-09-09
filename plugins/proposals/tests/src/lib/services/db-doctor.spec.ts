import { readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	DEFAULT_DOCTOR_CHECKS,
	runDbDoctorTool,
} from '../../../../src/lib/tools/db-doctor.tool';

const roots: string[] = [];

const expectedCheckNames = [
	'integrity',
	'foreign_keys',
	'orphans',
	'duplicate_natural_ids',
	'invalid_statuses',
	'missing_relations',
	'revision_inconsistencies',
	'quarantined_imports',
	'stale_reconciliation',
	'git_sha_mismatch',
	'outbox_backlog',
	'lifecycle_anomalies',
	'enum_parity',
	'command_receipts',
] as const;

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('proposals DB doctor', () => {
	it('runs every check without mutating the active database', () => {
		const root = mkdtempSync(join(tmpdir(), 'db-doctor-'));
		roots.push(root);
		const databasePath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: databasePath });
		driver.close();
		const before = readFileSync(databasePath);

		const result = runDbDoctorTool({ workspaceRoot: root });
		const after = readFileSync(databasePath);

		expect(DEFAULT_DOCTOR_CHECKS).toHaveLength(14);
		expect(result.checks.map((check) => check.name)).toEqual(
			expectedCheckNames,
		);
		expect(result.checks.every((check) => check.severity === 'ok')).toBe(
			true,
		);
		expect(result.healthy).toBe(true);
		expect(after.equals(before)).toBe(true);
	});

	it('diagnoses a missing database instead of crashing on it', () => {
		// CI has no database: it is gitignored, derived and rebuildable.
		// The doctor used to throw `unable to open database file` there,
		// which failed `verify:tools` and told the operator nothing.
		const root = mkdtempSync(join(tmpdir(), 'db-doctor-absent-'));
		roots.push(root);

		const result = runDbDoctorTool({ workspaceRoot: root });

		expect(result.checks).toHaveLength(1);
		expect(result.checks[0]?.name).toBe('database-present');
		expect(result.checks[0]?.severity).toBe('warning');
		// Absent is not healthy — a doctor that examined nothing must
		// never report a clean bill of health.
		expect(result.healthy).toBe(false);
		expect(result.checks[0]?.message).toContain('reconcile');
	});
});
