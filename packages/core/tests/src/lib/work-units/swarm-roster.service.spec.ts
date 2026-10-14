/**
 * swarm-roster.service.spec.ts — every agent that joined a run is listed,
 * with what it produced.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	ISwarmUnit,
	ISwarmView,
} from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	describeRoster,
	rosterOf,
} from '@delendai/core/lib/work-units/swarm-roster.service';
import type { IUnitStandingEntry } from '@delendai/core/lib/work-units/unit-lease.interface';

const unit = (agent: string, ahead: number): ISwarmUnit => ({
	ref: `ns/wip/${agent}/implement/x1-S1-g1/work`,
	agent,
	subject: 'implement/x1-S1-g1/work',
	tip: `${agent}-tip`,
	ahead,
	behind: 0,
	paths: [],
});

const lease = (agent: string, session: string): IUnitStandingEntry =>
	fakePartial<IUnitStandingEntry, 'ref' | 'owner' | 'standing'>({
		ref: `ns/wip/${agent}/review/batch-all-g1/verdicts-${session}`,
		owner: { agent, session },
		standing: 'idle',
	});

const view = (
	units: readonly ISwarmUnit[],
	published: readonly ISwarmUnit[] = [],
): ISwarmView =>
	fakePartial<ISwarmView, 'units' | 'published'>({ units, published });

describe('rosterOf', () => {
	it('lists an agent that entered a unit and committed nothing', () => {
		const roster = rosterOf(view([unit('worker', 3)]), [
			lease('worker', 's1'),
			lease('silent', 's1'),
		]);
		expect(roster.map((each) => each.agent)).toEqual(['worker', 'silent']);
		expect(roster[0]).toMatchObject({ commits: 3, producedNothing: false });
		expect(roster[1]).toMatchObject({
			units: 0,
			commits: 0,
			producedNothing: true,
		});
		expect(describeRoster(roster).join('\n')).toContain(
			'silent  1 instance(s), 0 unit(s), 0 commit(s), 0 waiting to land — joined and produced nothing',
		);
	});

	it('counts the instances of one model, and a publication once', () => {
		const roster = rosterOf(
			view([unit('worker', 2)], [unit('worker', 2)]),
			[
				lease('worker', 's1'),
				lease('worker', 's2'),
				lease('worker', 's2'),
			],
		);
		expect(roster).toEqual([
			{
				agent: 'worker',
				instances: 2,
				units: 1,
				commits: 2,
				published: 1,
				producedNothing: false,
			},
		]);
	});

	it('says nothing where nobody is', () => {
		expect(rosterOf(view([]), [])).toEqual([]);
		expect(describeRoster([])).toEqual([]);
	});
});
