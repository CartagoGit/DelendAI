/**
 * publication-standings.service.spec.ts — `work status` weighs each open
 * publication: behind, overlap, age and whether its owner is there.
 */
import { describe, expect, it } from 'vitest';

describe('publicationStandings', () => {
	it('a publication behind by 3 with one overlapping file prints those numbers', async () => {
		const { describePublicationStanding, publicationStandings } =
			await import(
				'@delendai/core/lib/work-units/publication-standings.service'
			);
		const unit = (ref: string, behind: number, paths: string[]) => ({
			ref,
			agent: 'a',
			subject: ref,
			tip: `${ref}-tip`,
			ahead: 1,
			behind,
			paths,
		});
		const [first] = publicationStandings({
			published: [
				unit('delendai/pr/a/implement/x1-S1-g1/one', 3, [
					'src/a.ts',
					'src/b.ts',
				]),
				unit('delendai/pr/b/implement/x2-S1-g1/two', 0, ['src/a.ts']),
			],
			presence: new Map([
				[
					'delendai/pr/a/implement/x1-S1-g1/one',
					{
						orphaned: true,
						reason: 'finished',
						silentSeconds: null,
						why: '',
					},
				],
			]),
			tipAt: () => 1000,
			now: 1000 + 7200,
		});
		expect(first).toEqual({
			ref: 'delendai/pr/a/implement/x1-S1-g1/one',
			behind: 3,
			overlapping: 1,
			ageSeconds: 7200,
			ownerAlive: false,
		});
		expect(
			describePublicationStanding(first as NonNullable<typeof first>),
		).toBe(
			'publication      delendai/pr/a/implement/x1-S1-g1/one: 3 behind, 1 overlapping file(s), age 2h, owner gone',
		);
	});
});
