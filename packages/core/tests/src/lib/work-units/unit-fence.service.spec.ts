/**
 * unit-fence.service.spec.ts — the generation of a slice is a fence: a
 * unit publishes only while no higher generation of its slice exists.
 */
import { describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const listing = vi.hoisted(() => ({ refs: '' }));

vi.mock('@delendai/core/lib/work-units/work-unit-shared.service', () => ({
	readGit: () => listing.refs,
}));

import {
	readSupersedingUnit,
	supersedingUnit,
} from '@delendai/core/lib/work-units/unit-fence.service';

const MINE = 'refs/heads/work/wip/agent-a/implement/x00001-S1-g1/topic';

describe('supersedingUnit', () => {
	it('[<50ms] names the unit that took the slice over, whoever holds it now', () => {
		expect(
			supersedingUnit(
				[
					MINE,
					'refs/remotes/origin/work/wip/agent-b/implement/x00001-S1-g2/topic',
					'refs/remotes/origin/work/pr/agent-c/implement/x00001-S1-g3/other',
				],
				MINE,
			),
		).toEqual({
			generation: 3,
			ref: 'refs/remotes/origin/work/pr/agent-c/implement/x00001-S1-g3/other',
		});
	});

	it('[<50ms] finds none for the newest generation, another slice, or another kind of work', () => {
		expect(
			supersedingUnit(
				[
					MINE,
					'refs/heads/work/wip/agent-b/implement/x00001-S2-g4/topic',
					'refs/heads/work/wip/agent-b/implement/x00002-S1-g4/topic',
					'refs/heads/work/wip/agent-b/review/x00001-S1-g4/topic',
				],
				MINE,
			),
		).toBeUndefined();
		expect(
			supersedingUnit(
				[MINE],
				'refs/heads/work/wip/agent-a/implement/x00001-S1-g2/topic',
			),
		).toBeUndefined();
	});

	it('[<50ms] says nothing of a ref that names no unit', () => {
		expect(
			supersedingUnit([MINE], 'refs/heads/work/wip/loose'),
		).toBeUndefined();
	});
});

describe('readSupersedingUnit', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: '' },
		},
	});

	it('[<50ms] reads the generations of the units this clone knows of, in either spelling', () => {
		listing.refs = [
			'',
			'refs/heads/wip/agent-a/implement/x00001-S1-g1/topic',
			'refs/remotes/origin/wip/implement/agent-b/x00001-S1-G2/topic',
		].join('\n');
		expect(
			readSupersedingUnit(
				'/r',
				policy,
				'refs/heads/wip/agent-a/implement/x00001-S1-g1/topic',
			)?.generation,
		).toBe(2);
	});

	it('[<50ms] finds nothing when no clone ref outranks the unit', () => {
		listing.refs = '';
		expect(
			readSupersedingUnit(
				'/r',
				policy,
				'refs/heads/wip/agent-a/implement/x00001-S1-g1/topic',
			),
		).toBeUndefined();
	});
});
