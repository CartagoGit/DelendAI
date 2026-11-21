import { describe, expect, it } from 'vitest';

import { abandonedAfterSeconds } from '@delendai/core/lib/work-units/forge-work-refs.service';

import { silentWorkRefs } from './silent-work-refs';

const NOW = 2_000_000_000;
const LEASE = 30;
const limit = abandonedAfterSeconds(LEASE);

describe('silentWorkRefs', () => {
	it('names a work ref silent past what a unit is given, and how long', () => {
		expect(
			silentWorkRefs({
				refs: [
					{
						name: 'delendai/wip/a/review/batch-all-g1/verdicts',
						committedAt: NOW - limit - 7200,
						published: false,
					},
				],
				leaseTtlMinutes: LEASE,
				now: NOW,
			}),
		).toEqual([
			{
				name: 'delendai/wip/a/review/batch-all-g1/verdicts',
				hours: Math.round((limit + 7200) / 3600),
			},
		]);
	});

	it('leaves a unit its owner parked, asking only of the refs it would retire', () => {
		const asked: string[] = [];
		expect(
			silentWorkRefs({
				refs: [
					{
						name: 'parked',
						committedAt: NOW - limit - 60,
						published: false,
					},
					{
						name: 'working',
						committedAt: NOW - 60,
						published: false,
					},
				],
				leaseTtlMinutes: LEASE,
				now: NOW,
				isParked: (name) => {
					asked.push(name);
					return name === 'parked';
				},
			}),
		).toEqual([]);
		expect(asked).toEqual(['parked']);
	});

	it('leaves a unit that is working, one that is published, and one it cannot date', () => {
		expect(
			silentWorkRefs({
				refs: [
					{
						name: 'working',
						committedAt: NOW - 60,
						published: false,
					},
					{
						name: 'published',
						committedAt: NOW - limit - 7200,
						published: true,
					},
					{
						name: 'undated',
						committedAt: Number.NaN,
						published: false,
					},
				],
				leaseTtlMinutes: LEASE,
				now: NOW,
			}),
		).toEqual([]);
	});
});
