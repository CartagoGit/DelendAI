/**
 * state-database-seam.spec.ts — a missing database is a diagnosis.
 *
 * The operational state database is a rebuildable materialized view: a
 * machine that has just cloned the repository HAS none, and every layer
 * above it must be able to say so without an errno and without a throw.
 * The last spec runs the REAL `reconcileStartup` through the real gate on
 * a workspace with no database at all, because that is the boot an
 * adopter actually experiences on day one.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/core/lib/contracts/interfaces/git-runner.interface';
import {
	createStateDatabaseSeam,
	probeStateDatabase,
	runStartupGate,
} from '@delendai/core/lib/startup-gate/index';
import { needsRepairTask } from '@delendai/core/lib/startup-reconciler/index';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const remoteOnlyRunner: IGitRunner = async (
	args: readonly string[],
): Promise<IGitRunResult> => {
	if (args[0] === 'remote' && args.length === 1) {
		return { ok: true, output: 'origin\n' };
	}
	if (args[0] === 'remote' && args[1] === 'get-url') {
		return { ok: true, output: 'git@github.com:acme/widgets.git\n' };
	}
	return { ok: false, output: '', reason: 'not available in this spec' };
};

describe('the state-database seam on a machine that has none', () => {
	it('probes an absent file as absent, not as an error', async () => {
		const workspace = createTestWorkspace('startup-db-');
		try {
			const probe = await probeStateDatabase(
				join(workspace, 'state', 'proposals.sqlite'),
			);
			expect(probe.kind).toBe('absent');
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('answers `absent` from open() when the run may not create one', async () => {
		const workspace = createTestWorkspace('startup-db-');
		try {
			const seam = await createStateDatabaseSeam({
				databasePath: join(workspace, 'state', 'proposals.sqlite'),
			});
			expect(seam.open({ allowCreate: false })).toEqual({
				kind: 'absent',
			});
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('reports a directory in the database`s place as unreadable', async () => {
		const workspace = createTestWorkspace('startup-db-');
		try {
			const path = join(workspace, 'proposals.sqlite');
			await mkdir(path, { recursive: true });
			const probe = await probeStateDatabase(path);
			expect(probe.kind).toBe('unreadable');
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('turns an adapter that throws into a diagnosis, never a crash', async () => {
		const workspace = createTestWorkspace('startup-db-');
		try {
			const path = join(workspace, 'proposals.sqlite');
			await writeFile(path, '', 'utf8');
			const seam = await createStateDatabaseSeam({
				databasePath: path,
				openPorts: () => {
					throw new Error('unable to open database file');
				},
			});
			const opened = seam.open({ allowCreate: true });
			expect(opened.kind).toBe('unreadable');
			expect(opened.kind === 'unreadable' ? opened.reason : '').toContain(
				'unable to open database file',
			);
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('a real boot with no database yields DEGRADED with a named finding', async () => {
		const workspace = createTestWorkspace('startup-db-');
		try {
			const outcome = await runStartupGate({
				policy: expandProfile('shared-checkout-pr'),
				workspaceRoot: workspace,
				agentId: 'agent-a',
				lockPath: join(workspace, '.cache', 'reconcile.lock'),
				databasePath: join(
					workspace,
					'.delendai',
					'state',
					'proposals.sqlite',
				),
				git: remoteOnlyRunner,
				allowCreate: false,
			});
			expect(outcome.kind).toBe('reconciled');
			if (outcome.kind !== 'reconciled') return;
			expect(outcome.report.status).toBe('DEGRADED');
			expect(
				outcome.report.blockers.map((finding) => finding.code),
			).toContain('state-database.absent');
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('reports an unbound adapter as unverifiable, never as corrupt', async () => {
		// A host with no adapter has learned NOTHING about the database.
		// Reporting `corrupt` there is a fabricated verdict, and a
		// dangerous one: the repair task for `corrupt` proposes
		// rebuilding the file, so acting on it would destroy healthy
		// state to fix a problem that was never observed.
		const workspace = createTestWorkspace('startup-db-unbound-');
		try {
			const databasePath = join(workspace, 'state.sqlite');
			await writeFile(
				databasePath,
				'a healthy database, as far as we know',
				'utf8',
			);

			const seam = await createStateDatabaseSeam({ databasePath });
			const opened = seam.open({ allowCreate: false });

			expect(seam.probe().kind).toBe('present');
			expect(opened.kind).toBe('unverifiable');
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('classifies unverifiable as blocking but generating no repair work', () => {
		// It blocks READY, because nothing was verified. It generates no
		// repair task, because there is nothing to repair — only
		// something to bind.
		expect(needsRepairTask('state-database.unverifiable')).toBe(false);
		expect(needsRepairTask('state-database.corrupt')).toBe(true);
	});
});
