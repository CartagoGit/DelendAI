import { describe, expect, it } from 'vitest';

import { HYDRATION_STEPS } from './hydrate-candidates-after-merge.script';
import { reapCommand, summarise } from './reap-finished-units.script';

describe('reap-finished-units', () => {
	it('runs the product reaper, and applies only when told to', () => {
		expect(reapCommand(false)).toEqual([
			'packages/cli/src/index.ts',
			'--json',
			'work',
			'reap',
		]);
		expect(reapCommand(true).at(-1)).toBe('--apply');
	});

	it('says what was reaped, by kind, or that nothing was', () => {
		expect(
			summarise({
				data: { units: [{}, {}], husks: [], reservations: [{}] },
			}),
		).toBe('2 units, 1 reservations');
		expect(summarise({ data: { units: [] } })).toBe('nothing to reap');
		expect(summarise(undefined)).toBe('nothing to reap');
	});

	it('is a step of the pass that runs after every merge', () => {
		expect(HYDRATION_STEPS.map(([script]) => script)).toContain(
			'tools/scripts/git/reap-finished-units.script.ts',
		);
	});
});
