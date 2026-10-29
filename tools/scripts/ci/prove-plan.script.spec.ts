/**
 * prove-plan.script.spec.ts — a matrix job is run locally the way CI runs it.
 */
import { describe, expect, it } from 'vitest';

import { vitestArgsOf } from './prove-plan.script';

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
