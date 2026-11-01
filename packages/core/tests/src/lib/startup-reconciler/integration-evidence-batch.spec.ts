/**
 * integration-evidence-batch.spec.ts — a start reads what each ref holds once,
 * and falls back to one question per pair only when git cannot list it.
 */
import { describe, expect, it } from 'vitest';

import { runIntegrationEvidencePhase } from '@delendai/core/lib/startup-reconciler/phases/integration-evidence';
import type { IStartupGitSeam } from '@delendai/core/lib/startup-reconciler/seams.interface';
import type { IStartupStatePorts } from '@delendai/core/lib/startup-reconciler/state-ports.interface';

const generation = (wipHeadSha: string) => ({
	workUnitId: 1,
	generation: wipHeadSha.length,
	wipRef: `refs/heads/wip/${wipHeadSha}`,
	wipHeadSha,
	integratedSha: null,
});

const ports = (shas: readonly string[]) =>
	({
		journal: { listAll: () => [], append: () => undefined },
		workUnits: {
			listForRepository: () => [{ id: 1, uid: 'unit' }],
		},
		generations: {
			listForWorkUnit: () => shas.map(generation),
		},
	}) as unknown as IStartupStatePorts;

const phase = async (
	git: Pick<IStartupGitSeam, 'isAncestor' | 'reachableFrom'>,
	shas: readonly string[],
) =>
	runIntegrationEvidencePhase({
		ports: ports(shas),
		git: git as IStartupGitSeam,
		repositoryId: 1,
		integrationSha: 'tip',
		liveRefs: new Set(),
		keptBy: ['held-tip', 'other-tip'],
		retiredTips: ['retired-tip'],
		now: 1,
	});

describe('integration evidence over many checkpoints', () => {
	it('lists each set of tips once, however many checkpoints it answers', async () => {
		const listed: string[][] = [];
		const { findings } = await phase(
			{
				isAncestor: async () => {
					throw new Error('no question per pair');
				},
				reachableFrom: async (tips) => {
					listed.push([...tips]);
					return new Set(
						tips[0] === 'held-tip'
							? ['a', 'bb']
							: tips[0] === 'retired-tip'
								? ['ccc']
								: [],
					);
				},
			},
			['a', 'bb', 'ccc', 'dddd'],
		);
		expect(listed).toEqual([
			['tip'],
			['held-tip', 'other-tip'],
			['retired-tip'],
		]);
		expect(findings.map((found) => found.code)).toEqual([
			'integration-evidence.checkpoint-published',
			'integration-evidence.checkpoint-published',
			'integration-evidence.checkpoint-retired',
			'integration-evidence.ref-vanished',
		]);
	});

	it('asks pair by pair when git could not list the tips', async () => {
		const { findings } = await phase(
			{
				isAncestor: async (sha, tip) =>
					sha === 'a' && tip === 'other-tip',
				reachableFrom: async () => undefined,
			},
			['a', 'bb'],
		);
		expect(findings.map((found) => found.code)).toEqual([
			'integration-evidence.checkpoint-published',
			'integration-evidence.ref-vanished',
		]);
	});

	it('takes a seam with no listing for one that cannot list', async () => {
		const { findings } = await phase(
			{ isAncestor: async (_sha, tip) => tip === 'retired-tip' },
			['a'],
		);
		expect(findings.map((found) => found.code)).toEqual([
			'integration-evidence.checkpoint-retired',
		]);
	});
});
