/**
 * prove-plan.script.spec.ts — a matrix job is run locally the way CI runs it.
 */
import { describe, expect, it } from 'vitest';

import { fastSteps, vitestArgsOf } from './prove-plan.script';

const job = {
	name: 'plugins 1/4',
	paths: 'plugins/a plugins/b',
	shard: '1/4',
	run: true,
	filter: 'changed',
	readers: '',
};

describe('vitestArgsOf', () => {
	it('runs the specs the imports reach, on the job shard, against the base', () => {
		expect(vitestArgsOf(job, 'abc')).toEqual([
			'plugins/a',
			'plugins/b',
			'--shard=1/4',
			'--changed',
			'abc',
		]);
	});

	it('runs only the listed readers, or the zone unfiltered, or nothing', () => {
		expect(
			vitestArgsOf(
				{ ...job, filter: 'readers', readers: 'x.spec.ts y.spec.ts' },
				'abc',
			),
		).toEqual(['x.spec.ts', 'y.spec.ts']);
		expect(vitestArgsOf({ ...job, filter: 'all' }, 'abc')).toEqual([
			'plugins/a',
			'plugins/b',
			'--shard=1/4',
		]);
		expect(
			vitestArgsOf({ ...job, run: false, filter: 'none' }, 'abc'),
		).toBeUndefined();
	});
});

describe('fastSteps', () => {
	it('runs the nearest specs with the touched files covered, then judges that coverage', () => {
		const steps = fastSteps(
			['plugins/x/src/a.ts'],
			['plugins/x/a.spec.ts'],
			'b',
		);
		expect(steps.map(([label]) => label)).toEqual([
			'tests: the specs nearest the change',
			'changed-file coverage',
		]);
		expect(steps[0]?.[1]).toContain('plugins/x/a.spec.ts');
		expect(steps[0]?.[1]).toContain('--coverage');
		expect(steps[1]?.[1]).toContain('--base=b');
	});

	it('adds the bun suite for state or proposals code, and runs no tests for none near', () => {
		expect(
			fastSteps(['packages/state-sqlite/src/a.ts'], [], 'b').map(
				([label]) => label,
			),
		).toEqual(['test:sqlite']);
		expect(fastSteps(['README.md'], [], 'b')).toEqual([]);
	});
});
