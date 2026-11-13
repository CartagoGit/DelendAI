/**
 * derive-lessons.spec.ts — q00014 S5.
 *
 * The case the proposal names explicitly is the negative one: a
 * correlation with low support must NOT become a lesson. A store that
 * turns every coincidence into advice is worse than no store, because
 * an agent cannot tell which half to believe and stops reading both.
 *
 * The rest pins what makes a lesson arguable: the evidence it carries,
 * the confidence going DOWN when the project contradicts it, and the
 * ordering an agent relies on when it reads the top of the list and
 * stops.
 */
import { describe, expect, it } from 'vitest';

import {
	adviseFor,
	deriveLessons,
} from '../../../../src/lib/lessons/derive-lessons.helper';
import { scoreConfidence } from '../../../../src/lib/lessons/confidence.helper';
import type { IObservation } from '../../../../src/lib/contracts/interfaces/observation.interface';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const observation = (
	overrides: Partial<IObservation> & Pick<IObservation, 'subject'>,
): IObservation => ({
	kind: 'command-outcome',
	outcome: 'fail',
	atMs: NOW - DAY,
	source: 'test-journal',
	...overrides,
});

const repeat = (count: number, make: (index: number) => IObservation) =>
	Array.from({ length: count }, (_, index) => make(index));

describe('what a history does not support', () => {
	it('does not turn two sightings into a lesson', () => {
		const lessons = deriveLessons(
			repeat(2, () => observation({ subject: 'bun run test' })),
			{ nowMs: NOW },
		);

		expect(lessons).toEqual([]);
	});

	it('reports nothing at all from an empty store', () => {
		expect(deriveLessons([], { nowMs: NOW })).toEqual([]);
	});

	it('takes the threshold it is given', () => {
		const lessons = deriveLessons(
			repeat(2, () => observation({ subject: 'bun run test' })),
			{ nowMs: NOW, minimumSupport: 2 },
		);

		expect(lessons).toHaveLength(1);
	});
});

describe('what a history does support', () => {
	it('names a command that mostly fails here, with its evidence', () => {
		const lessons = deriveLessons(
			[
				...repeat(4, (index) =>
					observation({
						subject: 'bun run lint:web',
						atMs: NOW - index * DAY,
					}),
				),
				observation({
					subject: 'bun run lint:web',
					outcome: 'ok',
					atMs: NOW - 5 * DAY,
				}),
			],
			{ nowMs: NOW },
		);

		const [lesson] = lessons;
		expect(lesson?.kind).toBe('command-reliability');
		expect(lesson?.claim).toContain('failed 4 of the last 5 runs');
		// The evidence is what makes the claim checkable rather than
		// asserted, newest first and capped.
		expect(lesson?.evidence).toHaveLength(4);
		expect(lesson?.evidence[0]?.atMs).toBe(NOW);
	});

	it('separates a fragile test from a recurring refusal', () => {
		const lessons = deriveLessons(
			[
				...repeat(3, (index) =>
					observation({
						kind: 'test-failure',
						subject: 'suite > flaky case',
						atMs: NOW - index * DAY,
					}),
				),
				...repeat(3, (index) =>
					observation({
						kind: 'refusal',
						subject: 'SLICE_NOT_CLAIMED',
						atMs: NOW - index * DAY,
					}),
				),
			],
			{ nowMs: NOW },
		);

		expect(lessons.map((lesson) => lesson.kind).sort()).toEqual([
			'fragile-test',
			'recurring-refusal',
		]);
	});

	it('puts what is most likely true today at the top', () => {
		// An agent reads the top of this list and stops.
		const lessons = deriveLessons(
			[
				...repeat(6, (index) =>
					observation({
						subject: 'always fails',
						atMs: NOW - index * DAY,
					}),
				),
				...repeat(3, (index) =>
					observation({
						subject: 'sometimes fails',
						atMs: NOW - index * DAY,
					}),
				),
				...repeat(3, (index) =>
					observation({
						subject: 'sometimes fails',
						outcome: 'ok',
						atMs: NOW - index * DAY,
					}),
				),
			],
			{ nowMs: NOW },
		);

		expect(lessons[0]?.subject).toBe('always fails');
		expect(lessons[0]?.confidence.score).toBeGreaterThan(
			lessons[1]?.confidence.score ?? 1,
		);
	});
});

describe('a lesson that stops reproducing', () => {
	it('degrades when the project contradicts it', () => {
		const contradicted = scoreConfidence({
			support: 4,
			counterExamples: 6,
			recentSupport: 4,
		});
		const clean = scoreConfidence({
			support: 4,
			counterExamples: 0,
			recentSupport: 4,
		});

		expect(contradicted.score).toBeLessThan(clean.score);
		expect(contradicted.band).not.toBe('high');
	});

	it('degrades when nothing recent supports it', () => {
		// A lesson about a command nobody has run since June is a
		// liability rather than knowledge.
		const stale = scoreConfidence({
			support: 6,
			counterExamples: 0,
			recentSupport: 0,
		});
		const fresh = scoreConfidence({
			support: 6,
			counterExamples: 0,
			recentSupport: 6,
		});

		expect(stale.score).toBeLessThan(fresh.score);
	});

	it('counts nothing as nothing rather than as certainty', () => {
		expect(
			scoreConfidence({
				support: 0,
				counterExamples: 0,
				recentSupport: 0,
			}),
		).toEqual({
			support: 0,
			counterExamples: 0,
			recentSupport: 0,
			score: 0,
			band: 'low',
		});
	});

	it('lets recency fall out of the window', () => {
		const lessons = deriveLessons(
			repeat(4, (index) =>
				observation({
					subject: 'bun run ancient',
					atMs: NOW - (30 + index) * DAY,
				}),
			),
			{ nowMs: NOW },
		);

		expect(lessons[0]?.confidence.recentSupport).toBe(0);
		expect(lessons[0]?.confidence.band).not.toBe('high');
	});
});

describe('advice for a stated goal', () => {
	const lessons = deriveLessons(
		repeat(4, (index) =>
			observation({
				subject: 'bun run lint:web',
				atMs: NOW - index * DAY,
			}),
		),
		{ nowMs: NOW },
	);

	it('matches the goal against what the lessons are about', () => {
		expect(adviseFor('lint:web', lessons)).toHaveLength(1);
		expect(
			adviseFor('bun run lint:web before pushing', lessons),
		).toHaveLength(1);
	});

	it('says nothing rather than guessing', () => {
		expect(adviseFor('deploy the site', lessons)).toEqual([]);
		expect(adviseFor('   ', lessons)).toEqual([]);
	});
});
