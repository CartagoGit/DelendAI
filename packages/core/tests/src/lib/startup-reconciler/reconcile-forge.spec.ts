/**
 * reconcile-forge.spec.ts — start-up marks a checkpoint integrated only
 * by its own head, and judges its CI by every run, in any order.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IForgePullRequest,
	IStartupForgeSeam,
} from '@delendai/core/lib/startup-reconciler/seams.interface';
import type {
	IGenerationView,
	IStartupStatePorts,
} from '@delendai/core/lib/startup-reconciler/state-ports.interface';
import {
	aggregateCheckState,
	runForgePhase,
} from '@delendai/core/lib/startup-reconciler/phases/reconcile-forge';

const REF = 'refs/heads/delendai/wip/agent-a/implement/x00001-S1-g1/topic';
const CHECKPOINT = 'a'.repeat(40);

const harness = () => {
	const integrated: string[] = [];
	const validations: string[] = [];
	const ports = fakePartial<IStartupStatePorts>({
		forge: fakePartial<IStartupStatePorts['forge']>({
			upsertPullRequest: () => fakePartial({ id: 1 }),
			upsertCiRun: () => ({ id: 1 }),
		}),
		generations: fakePartial<IStartupStatePorts['generations']>({
			get: () =>
				fakePartial<IGenerationView>({
					workUnitId: 1,
					generation: 1,
					checkpointKind: 'merge-candidate',
				}),
			attachPullRequest: () => null,
			markIntegrated: (input: { readonly integratedSha: string }) => {
				integrated.push(input.integratedSha);
				return fakePartial({ first: true });
			},
			recordValidation: (input: { readonly validationState: string }) => {
				validations.push(input.validationState);
				return null;
			},
		}),
	});
	return { ports, integrated, validations };
};

type ICheckPayload = Extract<
	Awaited<ReturnType<IStartupForgeSeam['listCheckRuns']>>,
	{ readonly kind: 'payload' }
>['payload'];

const run = (
	ports: IStartupStatePorts,
	pulls: readonly IForgePullRequest[],
	checks: ICheckPayload = [],
) =>
	runForgePhase({
		forge: fakePartial<IStartupForgeSeam>({
			listPullRequests: async () => ({
				kind: 'payload' as const,
				payload: pulls,
			}),
			listCheckRuns: async () => ({
				kind: 'payload' as const,
				payload: checks,
			}),
		}),
		ports,
		repositoryId: 1,
		rebuilt: [
			{
				ref: REF,
				sha: CHECKPOINT,
				workUnitId: 1,
				workUnitUid: 'u1',
				generation: 1,
			},
		],
		previousEtag: '',
		machineId: 'laptop',
		now: 1,
	});

describe('runForgePhase', () => {
	it('marks the checkpoint integrated only when the merged head is that checkpoint', async () => {
		const other = harness();
		await run(other.ports, [
			{
				number: 7,
				headRef: REF.replace('refs/heads/', ''),
				baseRef: 'develop',
				headSha: 'b'.repeat(40),
				state: 'merged',
				mergeSha: 'c'.repeat(40),
			},
		]);
		expect(other.integrated).toEqual([]);

		const own = harness();
		await run(own.ports, [
			{
				number: 7,
				headRef: REF.replace('refs/heads/', ''),
				baseRef: 'develop',
				headSha: CHECKPOINT,
				state: 'merged',
				mergeSha: 'c'.repeat(40),
			},
		]);
		expect(own.integrated).toEqual(['c'.repeat(40)]);
	});

	it('records one verdict from every run of the head, in any order', async () => {
		const runs: ICheckPayload = [
			{
				candidateSha: CHECKPOINT,
				workflow: 'CI',
				checkName: 'a',
				state: 'failure',
			},
			{
				candidateSha: CHECKPOINT,
				workflow: 'CI',
				checkName: 'b',
				state: 'success',
			},
		];
		const first = harness();
		await run(first.ports, [], runs);
		const reversed = harness();
		await run(reversed.ports, [], [...runs].reverse());
		expect(first.validations).toEqual(['red']);
		expect(reversed.validations).toEqual(['red']);
	});
});

describe('aggregateCheckState', () => {
	it('lets a failure decide, then a run in progress, then a success over a cancellation', () => {
		expect(aggregateCheckState(['success', 'failure'])).toBe('failure');
		expect(aggregateCheckState(['success', 'in_progress'])).toBe(
			'in_progress',
		);
		expect(aggregateCheckState(['cancelled', 'success'])).toBe('success');
		expect(aggregateCheckState([])).toBeUndefined();
	});
});
