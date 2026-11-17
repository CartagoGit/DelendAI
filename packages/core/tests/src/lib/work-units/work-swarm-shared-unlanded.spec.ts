/**
 * work-swarm-shared-unlanded.spec.ts — the unlanded commits two units
 * share are read once per unit and intersected in memory (v00156).
 */
import { describe, expect, it } from 'vitest';

import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import { sharedUnlandedCounter } from '@delendai/core/lib/work-units/work-swarm.service';

const swarmUnit = (tip: string, ahead = 1): ISwarmUnit => ({
	ref: `ref-${tip}`,
	agent: 'a',
	subject: 's',
	tip,
	ahead,
	behind: 0,
	paths: [],
});

describe('the unlanded commits two units share (v00156)', () => {
	it('[<20ms] asks git once per unit, never with two tips, whatever the pairs', () => {
		const asked: string[][] = [];
		const history: Record<string, string[]> = {
			t1: ['c1'],
			t2: ['c1', 'c2'],
			t3: ['c1', 'c2', 'c3'],
			t4: ['d1'],
			t5: ['e1'],
		};
		const shared = sharedUnlandedCounter((...tips) => {
			asked.push(tips);
			return history[tips[0] ?? ''] ?? [];
		});
		const units = Object.keys(history).map((tip) => swarmUnit(tip));
		for (const [index, left] of units.entries()) {
			for (const right of units.slice(index + 1)) shared(left, right);
		}
		expect(asked).toHaveLength(units.length);
		expect(asked.every((tips) => tips.length === 1)).toBe(true);
		const [t1, t2, t3, t4] = units;
		expect(shared(t1 as ISwarmUnit, t2 as ISwarmUnit)).toBe(1);
		expect(shared(t2 as ISwarmUnit, t3 as ISwarmUnit)).toBe(2);
		expect(shared(t3 as ISwarmUnit, t4 as ISwarmUnit)).toBe(0);
		expect(asked).toHaveLength(units.length);
	});

	it('[<5ms] does not ask git about a unit with no commits of its own', () => {
		const asked: string[] = [];
		const shared = sharedUnlandedCounter((tip) => {
			asked.push(tip);
			return ['c1'];
		});
		expect(shared(swarmUnit('t1', 0), swarmUnit('t2'))).toBe(0);
		expect(asked).toEqual(['t2']);
	});
});
