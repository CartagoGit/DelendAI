import { describe, expect, it } from 'vitest';

import {
	execute,
	plan,
	toolOk,
	type IToolTextResult,
	type ITransactionResult,
} from '@delendai/core/public';

import gitManifest from '../../plugin.manifest';
import forgeManifest from '../../../forge/plugin.manifest';
import {
	capabilityGrantFromManifest,
	mergeCapabilityGrants,
} from '../../../commit-policy/src/lib/capabilities/manifest-grants';
import {
	buildGitCommitStep,
	buildGitPushStep,
} from '../../src/lib/transactions/git-write';
import { buildForgePrCreateStep } from '../../../forge/src/lib/transactions/forge-write';

interface IReceiptStore<T> {
	get(key: string): Promise<
		| {
				readonly key: string;
				readonly planFingerprint: string;
				readonly result: T;
		  }
		| undefined
	>;
	put(record: {
		readonly key: string;
		readonly planFingerprint: string;
		readonly result: T;
	}): Promise<void>;
}

const createReceiptStore = <T>(): IReceiptStore<T> => {
	const seen = new Map<
		string,
		{
			readonly key: string;
			readonly planFingerprint: string;
			readonly result: T;
		}
	>();
	return {
		get: async (key) => seen.get(key),
		put: async (record) => {
			seen.set(record.key, record);
		},
	};
};

const GIT_RUNNER_OK = async () => ({ ok: true, output: '', exitCode: 0 });

describe('r00044-S3 — transaction lifecycle and grants', () => {
	it('enforces preview → approval → execute → receipt replay with manifest grants', async () => {
		const calls = {
			commit: 0,
			push: 0,
			pr: 0,
		};
		const gitCommitGrant = capabilityGrantFromManifest(
			gitManifest,
			'commit',
		);
		const gitPushGrant = capabilityGrantFromManifest(gitManifest, 'push');
		const forgePrGrant = capabilityGrantFromManifest(
			forgeManifest,
			'pr_create',
		);
		const mergedGrant = mergeCapabilityGrants([
			gitCommitGrant,
			gitPushGrant,
			forgePrGrant,
		]);

		const descriptor = plan(
			[
				buildGitCommitStep({
					args: { message: 'feat: tx commit', files: ['README.md'] },
					toolOptions: {
						run: GIT_RUNNER_OK,
					},
					capabilityGrant: gitCommitGrant,
					handler: async () => {
						calls.commit += 1;
						return toolOk({ committed: true, hash: 'abc1234' });
					},
				}),
				buildGitPushStep({
					args: { remote: 'origin', branch: 'agent/falcon' },
					toolOptions: {
						run: GIT_RUNNER_OK,
					},
					capabilityGrant: gitPushGrant,
					handler: async () => {
						calls.push += 1;
						return toolOk({ pushed: true });
					},
				}),
				buildForgePrCreateStep({
					args: { title: 'tx pr', confirm: true },
					toolOptions: {
						namespacePrefix: 'delendai_forge',
						workspaceRootAbs: '/tmp/workspace',
					},
					capabilityGrant: forgePrGrant,
					handler: async () => {
						calls.pr += 1;
						return toolOk({
							ok: true,
							provider: 'github',
							number: 51,
							url: 'https://example.invalid/pr/51',
						} satisfies Record<string, unknown>) as IToolTextResult;
					},
				}),
			],
			{
				id: 'git-forge-promotion',
				idempotencyKey: 'r00044-s3-demo',
				expectedState: {
					revision: 'branch:agent/falcon@1',
					values: { branch: 'agent/falcon', clean: true },
				},
				capabilityGrant: mergedGrant,
			},
		);

		expect(descriptor.meta.capabilityGrant.permissions).toEqual([
			'forge-write',
			'git-write',
			'network',
		]);

		const preview = await execute(descriptor, { dryRun: true });
		expect(preview.ok).toBe(true);
		expect(preview.receipt.stage).toBe('preview');
		expect(calls).toEqual({ commit: 0, push: 0, pr: 0 });

		const expectedState = descriptor.meta.expectedState;
		if (expectedState === undefined) {
			throw new Error('expected state missing');
		}

		const blocked = await execute(descriptor, {
			currentState: expectedState,
		});
		expect(blocked.ok).toBe(false);
		expect(blocked.receipt.stage).toBe('approval-required');
		expect(blocked.error?.code).toBe('approval-required');

		const receiptStore = createReceiptStore<typeof blocked>();
		const approval = {
			granted: true,
			capabilities: ['git-write', 'forge-write', 'network'],
			approver: 'plan-execution-orchestrator',
			receipt: 'approval-r00044-s3',
		} as const;
		const executed = await execute(descriptor, {
			currentState: expectedState,
			approval,
			receiptStore,
		});
		expect(executed.ok).toBe(true);
		expect(executed.receipt.stage).toBe('executed');
		expect(executed.receipt.approved).toBe(true);
		expect(executed.receipt.approver).toBe('plan-execution-orchestrator');
		expect(executed.receipt.approvalReceipt).toBe('approval-r00044-s3');
		expect(executed.executedStepNames).toEqual([
			'git.commit',
			'git.push',
			'forge.pr_create',
		]);
		expect(calls).toEqual({ commit: 1, push: 1, pr: 1 });

		const replayed = await execute(descriptor, {
			currentState: expectedState,
			approval,
			receiptStore,
		});
		expect(replayed.ok).toBe(true);
		expect(replayed.receipt.stage).toBe('replayed');
		expect(replayed.receipt.replayed).toBe(true);
		expect(replayed.receipt.approvalReceipt).toBe('approval-r00044-s3');
		expect(calls).toEqual({ commit: 1, push: 1, pr: 1 });

		const mismatchedReplay = await execute(descriptor, {
			currentState: expectedState,
			approval: {
				...approval,
				receipt: 'tampered-approval',
			},
			receiptStore,
		});
		expect(mismatchedReplay.ok).toBe(false);
		expect(mismatchedReplay.error?.code).toBe('approval-mismatch');
		expect(mismatchedReplay.receipt.stage).toBe('failed');
		expect(calls).toEqual({ commit: 1, push: 1, pr: 1 });
	});

	it('fails closed on expected-state mismatch and on idempotency conflicts', async () => {
		const grant = mergeCapabilityGrants([
			capabilityGrantFromManifest(gitManifest, 'commit'),
		]);
		const receiptStore =
			createReceiptStore<ITransactionResult<IToolTextResult>>();
		const baseOptions = {
			capabilityGrant: grant,
			id: 'commit-only',
			idempotencyKey: 'shared-key',
			expectedState: {
				revision: 'branch:agent/falcon@2',
				values: { branch: 'agent/falcon' },
			},
		} as const;

		const firstPlan = plan(
			[
				buildGitCommitStep({
					args: { message: 'feat: first plan', files: ['README.md'] },
					toolOptions: {
						run: GIT_RUNNER_OK,
					},
					capabilityGrant: grant,
					handler: async () =>
						toolOk({ committed: true, hash: 'abc1234' }),
				}),
			],
			baseOptions,
		);

		const firstExpectedState = firstPlan.meta.expectedState;
		if (firstExpectedState === undefined) {
			throw new Error('expected state missing');
		}

		const mismatch = await execute(firstPlan, {
			currentState: {
				revision: 'branch:agent/falcon@3',
				values: { branch: 'agent/falcon' },
			},
			approval: { granted: true, capabilities: ['git-write'] },
			receiptStore,
		});
		expect(mismatch.ok).toBe(false);
		expect(mismatch.error?.code).toBe('expected-state-mismatch');

		const executed = await execute(firstPlan, {
			currentState: firstExpectedState,
			approval: { granted: true, capabilities: ['git-write'] },
			receiptStore,
		});
		expect(executed.ok).toBe(true);

		const conflictingPlan = plan(
			[
				buildGitCommitStep({
					args: {
						message: 'feat: second plan',
						files: ['package.json'],
					},
					toolOptions: {
						run: GIT_RUNNER_OK,
					},
					capabilityGrant: grant,
					handler: async () =>
						toolOk({ committed: true, hash: 'def5678' }),
				}),
			],
			baseOptions,
		);

		const conflict = await execute(conflictingPlan, {
			currentState: firstExpectedState,
			approval: { granted: true, capabilities: ['git-write'] },
			receiptStore,
		});
		expect(conflict.ok).toBe(false);
		expect(conflict.error?.code).toBe('idempotency-key-conflict');
	});
});
