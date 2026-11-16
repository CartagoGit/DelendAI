/**
 * land-rounds.helper.spec.ts — a pass covers what arrives while it runs:
 * another round when a land run was created during one, at most three.
 */
import type { ILandForge } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { runLandRounds } from '../../../../src/lib/services/land-rounds.helper';

/** A forge whose listing is the given answer for each call, in order. */
const forgeOf = (
	answers: readonly (readonly { id: number; status: string }[] | 'fails')[],
) => {
	let call = 0;
	return fakePartial<ILandForge>({
		landRuns: async () => {
			const answer = answers[Math.min(call++, answers.length - 1)] ?? [];
			if (answer === 'fails') throw new Error('502');
			return answer;
		},
	});
};

const own = { id: 10, status: 'in_progress' };

describe('runLandRounds', () => {
	it('[<20ms] makes one round when no newer run exists', async () => {
		let rounds = 0;
		const done = await runLandRounds(
			forgeOf([[own]]),
			async () => ++rounds,
		);
		expect(done.reports).toEqual([1]);
		expect(done.notes).toEqual([]);
	});

	it('[<20ms] makes a second round when a run was created during the first, and ignores one already completed', async () => {
		let rounds = 0;
		const done = await runLandRounds(
			forgeOf([
				[own],
				[{ id: 11, status: 'queued' }, own],
				[{ id: 11, status: 'queued' }, own],
				[{ id: 11, status: 'completed' }, own],
			]),
			async () => ++rounds,
		);
		expect(done.reports).toEqual([1, 2]);
		expect(done.notes).toEqual([]);
	});

	it('[<20ms] stops at three rounds when a newer run appears every round, and says so', async () => {
		let rounds = 0;
		let next = 10;
		const grow = () => {
			next += 1;
			return [{ id: next, status: 'queued' }, own];
		};
		const forge = fakePartial<ILandForge>({
			landRuns: async () => grow(),
		});
		const done = await runLandRounds(forge, async () => ++rounds);
		expect(done.reports).toEqual([1, 2, 3]);
		expect(done.notes.join(' ')).toContain('3 rounds are the most');
	});

	it('[<20ms] makes one round with a note when the listing fails, and never fails the pass', async () => {
		const done = await runLandRounds(forgeOf(['fails']), async () => 'ok');
		expect(done.reports).toEqual(['ok']);
		expect(done.notes.join(' ')).toContain('could not be listed');
	});

	it('[<20ms] ends with a note when the listing fails after a round', async () => {
		const done = await runLandRounds(
			forgeOf([[own], 'fails']),
			async () => 1,
		);
		expect(done.reports).toEqual([1]);
		expect(done.notes.join(' ')).toContain('after round 1');
	});

	it('[<20ms] makes no further round after a report that ends the pass', async () => {
		const done = await runLandRounds(
			forgeOf([[own], [{ id: 11, status: 'queued' }]]),
			async () => 'gone',
			(report) => report === 'gone',
		);
		expect(done.reports).toEqual(['gone']);
	});
});
