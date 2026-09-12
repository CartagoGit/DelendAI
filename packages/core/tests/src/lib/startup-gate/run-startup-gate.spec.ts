/**
 * run-startup-gate.spec.ts — the boot path, not the library.
 *
 * The audit's finding was that `reconcileStartup` existed and nothing
 * called it. These specs assert the call itself: that a policy which
 * needs reconciliation gets it, that a policy which does not is left
 * alone, and that a DEGRADED verdict reaches the operator report instead
 * of being swallowed by the boot that produced it.
 */

import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/core/lib/contracts/interfaces/git-runner.interface';
import {
	renderStartupGate,
	runStartupGate,
	startupGateWarnings,
} from '@delendai/core/lib/startup-gate/index';
import type {
	IReconcileStartupInput,
	IStartupReconciliationReport,
} from '@delendai/core/lib/startup-reconciler/index';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const REMOTE_URL = 'git@github.com:acme/widgets.git';

/** A runner that knows only what the environment seam asks it. */
const remoteOnlyRunner: IGitRunner = async (
	args: readonly string[],
): Promise<IGitRunResult> => {
	if (args[0] === 'remote' && args.length === 1) {
		return { ok: true, output: 'origin\n' };
	}
	if (args[0] === 'remote' && args[1] === 'get-url') {
		return { ok: true, output: `${REMOTE_URL}\n` };
	}
	return { ok: false, output: '', reason: 'not available in this spec' };
};

const degradedReport = (): IStartupReconciliationReport => ({
	status: 'DEGRADED',
	reconcilerVersion: 1,
	mode: 'full',
	startedAt: 1,
	completedAt: 2,
	machineId: 'machine-1',
	phases: [],
	findings: [],
	blockers: [
		{
			code: 'state-database.absent',
			phase: 'state-database',
			kind: 'blocker',
			repairClass: 'ambiguous',
			subject: '/ws/.delendai/state/proposals.sqlite',
			message: 'database absent / not initialized',
			blocksMutation: true,
			recoveryRequired: true,
		},
	],
	repairTasks: [
		{
			id: 'state-database.absent:proposals',
			code: 'state-database.absent',
			phase: 'state-database',
			subject: 'proposals',
			title: 'Initialise the operational state database',
			evidence: ['probe returned absent'],
			suggestedActions: ['run the proposals db rebuild'],
			blocksMutation: true,
		},
	],
	counters: {
		gitFetches: 0,
		forgeRequests: 0,
		refsExamined: 0,
		refsSkippedUnchanged: 0,
		workUnitsRebuilt: 0,
		generationsRecorded: 0,
		generationsIntegrated: 0,
		pullRequestsReconciled: 0,
		ciRunsReconciled: 0,
		journalEventsImported: 0,
		journalEventsSkipped: 0,
		leasesExpired: 0,
		claimsReleased: 0,
		workUnitsRecoverable: 0,
		migrationsApplied: 0,
		projectionsRebuilt: 0,
	},
	mutationsBlocked: true,
	recoveryRequired: true,
	fingerprint: 'fp-1',
});

const gateInput = (
	workspace: string,
	profile: 'shared-direct' | 'shared-checkout-pr',
	reconcile: (
		input: IReconcileStartupInput,
	) => Promise<IStartupReconciliationReport>,
) => ({
	policy: expandProfile(profile),
	workspaceRoot: workspace,
	agentId: 'agent-a',
	lockPath: `${workspace}/.cache/startup/reconcile.lock`,
	databasePath: `${workspace}/.delendai/state/proposals.sqlite`,
	git: remoteOnlyRunner,
	reconcile,
});

describe('runStartupGate', () => {
	it('calls the reconciler when the policy requires it', async () => {
		const workspace = createTestWorkspace('startup-gate-');
		try {
			const seen: IReconcileStartupInput[] = [];
			const outcome = await runStartupGate(
				gateInput(workspace, 'shared-checkout-pr', async (input) => {
					seen.push(input);
					return degradedReport();
				}),
			);
			expect(seen).toHaveLength(1);
			expect(outcome.kind).toBe('reconciled');
			// The seams the boot path is responsible for building.
			const [input] = seen;
			expect(input?.environmentSeam).toBeDefined();
			expect(input?.database).toBeDefined();
			expect(input?.git).toBeDefined();
			expect(input?.mutex).toBeDefined();
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('does NOT call the reconciler when the policy does not require it', async () => {
		const workspace = createTestWorkspace('startup-gate-');
		try {
			let calls = 0;
			const outcome = await runStartupGate(
				gateInput(workspace, 'shared-direct', async () => {
					calls += 1;
					return degradedReport();
				}),
			);
			expect(calls).toBe(0);
			expect(outcome.kind).toBe('not-required');
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('surfaces a DEGRADED verdict instead of swallowing it', async () => {
		const workspace = createTestWorkspace('startup-gate-');
		try {
			const outcome = await runStartupGate(
				gateInput(workspace, 'shared-checkout-pr', async () =>
					degradedReport(),
				),
			);
			const warnings = startupGateWarnings(outcome);
			expect(warnings[0]?.severity).toBe('error');
			expect(warnings[0]?.message).toContain('DEGRADED');
			expect(
				warnings.some(
					(warning) =>
						warning.severity === 'error' &&
						warning.message.includes(
							'database absent / not initialized',
						),
				),
			).toBe(true);
			// The optional phases had no collaborator; the report must say
			// so rather than let a reader infer that they passed.
			expect(warnings[0]?.message).toContain(
				'phases NOT EXECUTED: forge, journal, governance',
			);

			const lines = renderStartupGate(outcome);
			expect(lines[0]).toContain('DEGRADED');
			expect(lines.join('\n')).toContain('state-database.absent');
			expect(lines.join('\n')).toContain(
				'Generated repair work (ids are stable across boots)',
			);
		} finally {
			removeTestWorkspace(workspace);
		}
	});

	it('reports NOT REQUIRED as information, never as a pass', async () => {
		const workspace = createTestWorkspace('startup-gate-');
		try {
			const outcome = await runStartupGate(
				gateInput(workspace, 'shared-direct', async () =>
					degradedReport(),
				),
			);
			const [warning] = startupGateWarnings(outcome);
			expect(warning?.severity).toBe('info');
			expect(warning?.message).toContain('NOT REQUIRED');
			expect(renderStartupGate(outcome)[0]).toContain('NOT REQUIRED');
		} finally {
			removeTestWorkspace(workspace);
		}
	});
});
