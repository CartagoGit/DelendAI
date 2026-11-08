/**
 * publication-standings.service.spec.ts — what `work status` says of open
 * publications and of their owners (x01024, x01051).
 */
import { describe, expect, it } from 'vitest';

import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	describeOrphan,
	describePublicationStanding,
	publicationStandings,
} from '@delendai/core/lib/work-units/publication-standings.service';

const unit = (ref: string, over: Partial<ISwarmUnit> = {}): ISwarmUnit => ({
	ref,
	agent: 'a',
	subject: 's',
	tip: `tip-${ref}`,
	ahead: 1,
	behind: 0,
	paths: [],
	...over,
});

describe('publicationStandings', () => {
	it('counts what publications share, dates them and reads their owner', () => {
		const standings = publicationStandings({
			published: [
				unit('p1', { behind: 3, paths: ['a.ts', 'b.ts'] }),
				unit('p2', { paths: ['b.ts'] }),
			],
			presence: new Map([
				[
					'p1',
					{
						orphaned: true,
						reason: 'finished',
						silentSeconds: null,
						why: '',
					},
				],
			]),
			tipAt: (sha) => (sha === 'tip-p1' ? 900 : undefined),
			now: 1000,
		});
		expect(standings).toEqual([
			{
				ref: 'p1',
				behind: 3,
				overlapping: 1,
				ageSeconds: 100,
				ownerAlive: false,
			},
			{
				ref: 'p2',
				behind: 0,
				overlapping: 1,
				ageSeconds: null,
				ownerAlive: true,
			},
		]);
	});

	it('says each in a line', () => {
		expect(
			describePublicationStanding({
				ref: 'p1',
				behind: 3,
				overlapping: 1,
				ageSeconds: 7200,
				ownerAlive: true,
			}),
		).toBe(
			'publication      p1: 3 behind, 1 overlapping file(s), age 2h, owner alive',
		);
		expect(
			describePublicationStanding({
				ref: 'p2',
				behind: 0,
				overlapping: 0,
				ageSeconds: null,
				ownerAlive: false,
			}),
		).toContain('age ?, owner gone');
	});
});

describe('describeOrphan', () => {
	it('names the way in and the last beat', () => {
		const base = {
			ref: 'p1',
			agent: 'a',
			reason: 'finished' as const,
			why: '',
		};
		expect(
			describeOrphan({ ...base, orphaned: true, silentSeconds: null }),
		).toContain('last beat never');
		expect(
			describeOrphan({ ...base, orphaned: true, silentSeconds: 3600 }),
		).toContain('last beat 1h ago');
	});
});
