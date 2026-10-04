import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	canonicalTaskId,
	resolveCloseActor,
} from '../../../../src/lib/swarm/close-actor.resolver';

const SHAPE = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
}).branches;
const BRANCH = 'delendai/wip/owl/implement/x00871-S1-g1/a-topic';

describe('canonicalTaskId', () => {
	it.each(['x00871/S1', 'x00871-s1', 'X00871:S1', ' x00871-S1 '])(
		'reads %s as one task',
		(spelling) => {
			expect(canonicalTaskId(spelling)).toBe('x00871-S1');
		},
	);

	it('leaves an id that is not a slice task as written', () => {
		expect(canonicalTaskId('adhoc-task')).toBe('adhoc-task');
	});
});

describe('resolveCloseActor', () => {
	const base = { shape: SHAPE, proposalId: 'x00871', sliceId: 'S1' };

	it('prefers the argument, then the environment, then the work ref', () => {
		expect(
			resolveCloseActor({
				...base,
				agent: 'a',
				environment: 'b',
				branch: BRANCH,
			}),
		).toMatchObject({ agent: 'a', source: 'argument' });
		expect(
			resolveCloseActor({ ...base, environment: 'b', branch: BRANCH }),
		).toMatchObject({ agent: 'b', source: 'environment' });
		expect(resolveCloseActor({ ...base, branch: BRANCH })).toMatchObject({
			agent: 'owl',
			source: 'work-ref',
			ownsUnit: true,
		});
	});

	it('names nobody outside a unit with no declaration', () => {
		expect(resolveCloseActor({ ...base, branch: 'develop' })).toMatchObject(
			{ agent: undefined, source: 'none', ownsUnit: false },
		);
	});

	it('owns the unit of its own slice or of the whole proposal only', () => {
		expect(
			resolveCloseActor({ ...base, branch: BRANCH, sliceId: 'S2' })
				.ownsUnit,
		).toBe(false);
		expect(
			resolveCloseActor({ ...base, branch: BRANCH, agent: 'other' })
				.ownsUnit,
		).toBe(false);
		expect(
			resolveCloseActor({
				...base,
				branch: 'delendai/wip/owl/implement/x00871-all-g1/t',
				sliceId: 'S2',
			}).ownsUnit,
		).toBe(true);
	});

	it('takes the unit owner from its lease over the name in the ref', () => {
		const actor = resolveCloseActor({
			...base,
			branch: BRANCH,
			leaseOwner: 'heron',
		});
		expect(actor).toMatchObject({
			agent: 'heron',
			source: 'work-ref',
			ownsUnit: true,
		});
		expect(
			resolveCloseActor({
				...base,
				branch: BRANCH,
				leaseOwner: 'heron',
				agent: 'owl',
			}).ownsUnit,
		).toBe(false);
	});
});
