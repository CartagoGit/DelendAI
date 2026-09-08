import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../src';
import { runQuarantineRepair } from '../../../../plugins/proposals/src/lib/tools/quarantine-repair.tool';

const flat = (uid: string): string =>
	`---\nid: ${uid}\ntitle: Fixture ${uid}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: architecture\n---\n# Fixture ${uid}\n\nValid fixture.\n`;

const makeFiles = () => [
	...Array.from({ length: 50 }, (_, index) => {
		const uid = `x${String(index + 1).padStart(5, '0')}`;
		return {
			path: `ready/fixes/${uid}-fixture.md`,
			sha: `blob-${uid}`,
			raw: flat(uid),
		};
	}),
	{
		path: 'ready/fixes/x00051-corrupt.md',
		sha: 'blob-x00051-corrupt',
		raw: 'not a proposal document',
	},
];

describe('quarantine regression', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('preserves 50 valid proposals and repairs one corrupt proposal', () => {
		const root = mkdtempSync(join(tmpdir(), 'proposals-quarantine-e2e-'));
		roots.push(root);
		const paths = resolveProposalsDbPaths(root);
		const files = makeFiles();
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: root,
			statePath: paths.stateDir,
			sourceCommit: 'quarantine-e2e',
			sha: 'tree-quarantine-e2e',
			files,
			now: 100,
		});

		expect(staging.status).toBe('degraded');
		expect(staging.proposalsStaged).toBe(50);
		expect(staging.quarantinedEntries).toBe(1);
		expect(staging.integrity.status).toBe('ok');
		expect(staging.foreignKey.status).toBe('ok');

		const applied = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath: paths.databasePath,
			sourceCommit: 'quarantine-e2e',
			expectedDigest: staging.stagingDigest,
			now: 200,
		});
		expect(applied.status).toBe('ok');

		const corruptPath = join(root, 'ready/fixes/x00051-corrupt.md');
		mkdirSync(dirname(corruptPath), { recursive: true });
		writeFileSync(corruptPath, flat('x00051'), 'utf8');
		const quarantineDriver = new ProposalsSqliteDriver({
			path: paths.databasePath,
			readonly: true,
		});
		const quarantineId = quarantineDriver.handle
			.query<{ id: number }, []>('SELECT id FROM quarantine LIMIT 1')
			.get()?.id;
		quarantineDriver.close();
		expect(quarantineId).toBeDefined();
		const repaired = runQuarantineRepair(
			{ workspaceRoot: root },
			{ id: quarantineId as number, action: 're-parse', note: 'fixed fixture' },
		);
		expect(repaired.entries).toHaveLength(1);
		expect(repaired.entries[0]?.status).toBe('resolved');

		const driver = new ProposalsSqliteDriver({
			path: paths.databasePath,
			readonly: true,
		});
		try {
			expect(
				driver.handle
					.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM proposals')
					.get()?.count,
			).toBe(51);
			expect(
				driver.handle
					.query<{ count: number }, []>(
						"SELECT COUNT(*) AS count FROM quarantine WHERE status = 'resolved'",
					)
					.get()?.count,
		).toBe(1);
		} finally {
			driver.close();
		}
	});

	it('does not quarantine a file that is absent from the reconcile input', () => {
		const root = mkdtempSync(join(tmpdir(), 'proposals-quarantine-missing-'));
		roots.push(root);
		const paths = resolveProposalsDbPaths(root);
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: root,
			statePath: paths.stateDir,
			sourceCommit: 'missing-e2e',
			sha: 'tree-missing-e2e',
			files: [{ path: 'ready/fixes/x00001.md', sha: 'blob-x00001', raw: flat('x00001') }],
			now: 100,
		});

		expect(staging.status).toBe('ok');
		expect(staging.quarantinedEntries).toBe(0);
		const driver = new ProposalsSqliteDriver({
			path: staging.stagingPath,
			readonly: true,
		});
		try {
			expect(
				driver.handle
					.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM quarantine')
					.get()?.count,
			).toBe(0);
			expect(
				driver.handle
					.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM tombstones')
					.get()?.count,
			).toBe(0);
		} finally {
			driver.close();
		}
	});
});
