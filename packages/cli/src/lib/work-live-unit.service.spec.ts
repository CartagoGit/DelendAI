/**
 * work-live-unit.service.spec.ts — a command run outside a unit's worktree
 * finds the agent's one live unit, or refuses listing them; never `all`.
 */
import type { IUnitStandingEntry } from '@delendai/core/cli';
import { describe, expect, it } from 'vitest';

import {
	chooseLiveUnit,
	flagsOfLiveUnit,
	liveUnitsOf,
} from './work-live-unit.service';

const entry = (
	ref: string,
	standing: string,
	worktree: string | null = null,
): IUnitStandingEntry => ({ ref, standing, worktree }) as IUnitStandingEntry;

const parse = (ref: string) => {
	const m =
		/^refs\/heads\/(?<agent>[^/]+)\/(?<proposal>x\d+)-(?<slice>[^-]+)-g(?<g>\d+)$/u.exec(
			ref,
		)?.groups;
	return m === undefined
		? undefined
		: {
				agent: m.agent ?? '',
				kind: 'implement',
				proposal: m.proposal ?? '',
				slice: m.slice ?? '',
				generation: Number(m.g),
			};
};
const who = { agent: 'a', proposal: 'x1' };

describe('live units of an agent', () => {
	it('[<20ms] keeps the agent’s own units of the proposal that are not ended', () => {
		const units = liveUnitsOf(
			[
				entry('a/x1-S1-g1', 'live', '/w1'),
				entry('a/x1-S2-g1', 'delivered'),
				entry('b/x1-S3-g1', 'live'),
				entry('a/x2-S1-g1', 'live'),
			],
			who,
			parse,
		);
		expect(units.map((unit) => unit.ref)).toEqual(['a/x1-S1-g1']);
	});

	it('[<20ms] uses the only unit and names its flags', () => {
		const units = liveUnitsOf([entry('a/x1-S1-g2', 'idle')], who, parse);
		const chosen = chooseLiveUnit(units, { ...who, verb: 'deliver' });
		expect('unit' in chosen && flagsOfLiveUnit(chosen.unit)).toEqual([
			'--kind=implement',
			'--slice=S1',
			'--generation=2',
		]);
	});

	it('[<20ms] refuses with none, never guessing all', () => {
		const chosen = chooseLiveUnit([], { ...who, verb: 'deliver' });
		expect('refusal' in chosen && chosen.refusal.error).toContain(
			'no live unit of x1',
		);
	});

	it('[<20ms] refuses with several, listing each exact command', () => {
		const units = liveUnitsOf(
			[
				entry('a/x1-S1-g1', 'live', '/w1'),
				entry('a/x1-S2-g1', 'live', '/w2'),
			],
			who,
			parse,
		);
		const chosen = chooseLiveUnit(units, { ...who, verb: 'deliver' });
		const said = 'refusal' in chosen ? (chosen.refusal.error ?? '') : '';
		expect(said).toContain(
			'cd /w1 && delendai work deliver --proposal=x1 --kind=implement --slice=S1 --generation=1 --agent=a',
		);
		expect(said).toContain('--slice=S2');
	});
});
