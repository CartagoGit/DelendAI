/**
 * observation-store.spec.ts — q00014 S4.
 *
 * The three properties the store is built on, and the one the collector
 * is built on. All four are things that only show up under the
 * conditions this project actually runs in: several agents, a store
 * that outlives them, and artefacts written by processes that can be
 * killed mid-line.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	appendObservations,
	parseObservation,
	queryObservations,
	readObservations,
} from '../../../../src/lib/store/observation-store.service';
import {
	collectFromTestJournal,
	observationsFromJournalLine,
} from '../../../../src/lib/collectors/test-journal.service';
import type { IObservation } from '../../../../src/lib/contracts/interfaces/observation.interface';

/**
 * The read seam the plugin fills with `SafeWorkspaceReader`. A spec is
 * allowed to touch the filesystem directly; the plugin is not.
 */
const readText = async (path: string): Promise<string | null> =>
	readFile(path, 'utf8').catch(() => null);

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeStore = (): { filePath: string; dir: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'self-learning-'));
	dirs.push(dir);
	return { dir, filePath: join(dir, 'observations.jsonl') };
};

const observation = (overrides: Partial<IObservation> = {}): IObservation => ({
	kind: 'test-failure',
	subject: 'suite > case',
	outcome: 'fail',
	atMs: 1_700_000_000_000,
	source: 'test-journal',
	...overrides,
});

describe('the observation store', () => {
	it('reads an absent store as empty rather than failing', async () => {
		const { filePath } = makeStore();

		// Learning is an optimisation; it must never be able to fail the
		// work it exists to make cheaper. A fresh clone has no store.
		expect(await readObservations({ filePath, readText })).toEqual([]);
	});

	it('keeps what it is given and reports what it did', async () => {
		const { filePath } = makeStore();

		const first = await appendObservations({ filePath, readText }, [
			observation({ atMs: 1 }),
			observation({ atMs: 2, subject: 'other > case' }),
		]);
		expect(first).toEqual({
			appended: 2,
			skipped: 0,
			total: 2,
			compacted: 0,
		});

		const second = await appendObservations({ filePath, readText }, [
			observation({ atMs: 1 }),
			observation({ atMs: 3, subject: 'third > case' }),
		]);
		// The same fact observed twice is still one fact — a lesson's
		// confidence is built on how often something happened, so a
		// re-read of the same journal must not inflate it.
		expect(second.appended).toBe(1);
		expect(second.skipped).toBe(1);
		expect(second.total).toBe(3);
	});

	it('drops the oldest when it reaches its bound', async () => {
		const { filePath } = makeStore();

		const written = await appendObservations(
			{ filePath, readText, maxObservations: 2 },
			[
				observation({ atMs: 1, subject: 'oldest' }),
				observation({ atMs: 2, subject: 'middle' }),
				observation({ atMs: 3, subject: 'newest' }),
			],
		);

		expect(written.compacted).toBe(1);
		expect(
			(await readObservations({ filePath, readText })).map(
				(each) => each.subject,
			),
		).toEqual(['middle', 'newest']);
	});

	it('skips a line a killed process left half-written', async () => {
		const { filePath } = makeStore();
		await appendObservations({ filePath, readText }, [
			observation({ atMs: 10 }),
		]);
		writeFileSync(
			filePath,
			`${JSON.stringify(observation({ atMs: 10 }))}\n{"kind":"test-fail`,
			'utf8',
		);

		// One bad byte must not cost the store. That is the whole reason
		// it is JSONL and not one JSON array.
		expect(await readObservations({ filePath, readText })).toHaveLength(1);
	});

	it('refuses a record whose kind it does not know', () => {
		expect(
			parseObservation(
				'{"kind":"vibes","subject":"x","atMs":1,"outcome":"ok"}',
			),
		).toBeNull();
		expect(parseObservation('not json at all')).toBeNull();
		expect(parseObservation('')).toBeNull();
	});

	it('answers newest first, filtered', async () => {
		const { filePath } = makeStore();
		await appendObservations({ filePath, readText }, [
			observation({
				atMs: 1,
				kind: 'command-outcome',
				subject: 'bun test',
			}),
			observation({ atMs: 2, subject: 'a > b' }),
			observation({ atMs: 3, subject: 'a > b' }),
		]);

		expect(
			(
				await queryObservations(
					{ filePath, readText },
					{ kind: 'test-failure' },
				)
			).map((each) => each.atMs),
		).toEqual([3, 2]);
		expect(
			await queryObservations({ filePath, readText }, { sinceMs: 3 }),
		).toHaveLength(1);
		expect(
			await queryObservations(
				{ filePath, readText },
				{ subject: 'bun test' },
			),
		).toHaveLength(1);
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

	it('records the failures and the run, and nothing from the output', () => {
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

	it('records a passing run too', () => {
		// A store that only ever hears about failures cannot answer "does
		// this usually work?", which is most of what an arriving agent
		// wants to know.
		const observations = observationsFromJournalLine(
			entry({ result: 'pass', failures: [] }),
		);

		expect(observations).toHaveLength(1);
		expect(observations[0]?.outcome).toBe('ok');
	});

	it('drops an entry whose time cannot be read', () => {
		// A wrong timestamp is worse than a missing observation: recency
		// is half of what makes a lesson true.
		expect(
			observationsFromJournalLine(entry({ timestamp: 'nope' })),
		).toEqual([]);
		expect(observationsFromJournalLine('{ truncated')).toEqual([]);
	});

	it('reads an absent journal as nothing to learn', async () => {
		const { dir } = makeStore();

		expect(
			await collectFromTestJournal(join(dir, 'missing.jsonl'), readText),
		).toEqual([]);
	});

	it('folds a real journal file into the store', async () => {
		const { dir, filePath } = makeStore();
		const journalPath = join(dir, 'test-runs.jsonl');
		writeFileSync(
			journalPath,
			[entry(), entry({ result: 'pass', failures: [] })].join('\n'),
			'utf8',
		);

		const collected = await collectFromTestJournal(journalPath, readText);
		const written = await appendObservations(
			{ filePath, readText },
			collected,
		);

		// The two runs share a timestamp and a command, so the passing
		// run's `command-outcome` is a different fact (different outcome)
		// and the failing one's is not duplicated.
		expect(written.total).toBe(written.appended);
		expect(
			(
				await queryObservations(
					{ filePath, readText },
					{ kind: 'test-failure' },
				)
			).length,
		).toBe(1);
	});
});
