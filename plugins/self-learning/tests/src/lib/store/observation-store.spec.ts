/**
 * observation-store.spec.ts — q00014 S4: the pure half (parse, collect). The real-file half is observation-store.e2e.spec.ts.
 *
 * The three properties the store is built on, and the one the collector
 * is built on. All four are things that only show up under the
 * conditions this project actually runs in: several agents, a store
 * that outlives them, and artefacts written by processes that can be
 * killed mid-line.
 */
import { describe, expect, it } from 'vitest';

import { parseObservation } from '../../../../src/lib/store/observation-store.service';
import { observationsFromJournalLine } from '../../../../src/lib/collectors/test-journal.service';

describe('the observation store', () => {
	it('[<200ms] refuses a record whose kind it does not know', () => {
		expect(
			parseObservation(
				'{"kind":"vibes","subject":"x","atMs":1,"outcome":"ok"}',
			),
		).toBeNull();
		expect(parseObservation('not json at all')).toBeNull();
		expect(parseObservation('')).toBeNull();
	});
});

describe('collecting from the test journal', () => {
	const entry = (overrides: Record<string, unknown> = {}) =>
		JSON.stringify({
			schema: 1,
			runId: 'r1',
			timestamp: '2026-09-14T04:00:00.000Z',
			result: 'fail',
			command: 'bun run test',
			failures: [
				{
					file: 'packages/core/tests/x.spec.ts',
					fullName: 'suite > case',
					name: 'case',
					kind: 'test',
					message: 'expected 1 to be 2',
					diff: '- 1\n+ 2',
				},
			],
			...overrides,
		});

	it('[<200ms] records the failures and the run, and nothing from the output', () => {
		const observations = observationsFromJournalLine(entry());

		expect(observations.map((each) => each.kind)).toEqual([
			'command-outcome',
			'test-failure',
		]);
		expect(observations[1]?.subject).toBe('suite > case');
		// A message and a diff carry source text. An observation is a
		// fact about what happened, not a copy of the output.
		const serialised = JSON.stringify(observations);
		expect(serialised).not.toContain('expected 1 to be 2');
		expect(serialised).not.toContain('+ 2');
	});

	it('[<200ms] records a passing run too', () => {
		// A store that only ever hears about failures cannot answer "does
		// this usually work?", which is most of what an arriving agent
		// wants to know.
		const observations = observationsFromJournalLine(
			entry({ result: 'pass', failures: [] }),
		);

		expect(observations).toHaveLength(1);
		expect(observations[0]?.outcome).toBe('ok');
	});

	it('[<200ms] stores a budget warning with the test id, the normalized time and the estimate', () => {
		const observations = observationsFromJournalLine(
			entry({
				result: 'pass',
				failures: [],
				budgetWarnings: [
					{
						file: 'a.spec.ts',
						fullName: 'suite > slow case',
						normalizedMs: 320.4,
						estimateMs: 200,
						causes: ['git'],
					},
					{ fullName: 'no numbers' },
				],
			}),
		);

		const warnings = observations.filter(
			(each) => each.kind === 'budget-warning',
		);
		expect(warnings).toHaveLength(1);
		// The stored form is what the store parses back: it survives a round trip.
		const stored = parseObservation(JSON.stringify(warnings[0]));
		expect(stored?.subject).toBe('suite > slow case');
		expect(stored?.detail).toContain('normalizedMs=320');
		expect(stored?.detail).toContain('estimateMs=200');
	});

	it('[<200ms] drops an entry whose time cannot be read', () => {
		// A wrong timestamp is worse than a missing observation: recency
		// is half of what makes a lesson true.
		expect(
			observationsFromJournalLine(entry({ timestamp: 'nope' })),
		).toEqual([]);
		expect(observationsFromJournalLine('{ truncated')).toEqual([]);
	});
});
