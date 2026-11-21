import { describe, expect, it } from 'vitest';

import {
	findWaitForCycles,
	waitsBackOnto,
} from '../../../../src/lib/shared/wait-for-graph';

describe('waitsBackOnto', () => {
	it('is false for a one-way wait', () => {
		expect(
			waitsBackOnto({
				edges: [{ waiter: 'B', holder: 'C' }],
				start: 'B',
				target: 'A',
			}),
		).toBe(false);
	});

	it('is true for a two-party mutual wait', () => {
		expect(
			waitsBackOnto({
				edges: [{ waiter: 'B', holder: 'A' }],
				start: 'B',
				target: 'A',
			}),
		).toBe(true);
	});

	it('is true through an intermediary', () => {
		// A→B→C→A is exactly as unresolvable as A→B→A, and used to show
		// up only as three agents timing out forever.
		expect(
			waitsBackOnto({
				edges: [
					{ waiter: 'B', holder: 'C' },
					{ waiter: 'C', holder: 'A' },
				],
				start: 'B',
				target: 'A',
			}),
		).toBe(true);
	});

	it('terminates on a cycle that does not include the target', () => {
		expect(
			waitsBackOnto({
				edges: [
					{ waiter: 'B', holder: 'C' },
					{ waiter: 'C', holder: 'B' },
				],
				start: 'B',
				target: 'A',
			}),
		).toBe(false);
	});
});

describe('findWaitForCycles', () => {
	it('finds nothing in an acyclic graph', () => {
		expect(
			findWaitForCycles([
				{ waiter: 'A', holder: 'B' },
				{ waiter: 'B', holder: 'C' },
			]),
		).toEqual([]);
	});

	it('reports a deadlock once, not once per participant', () => {
		// Three agents in one cycle is ONE deadlock. Reporting it three
		// times would read as three separate problems to an operator.
		const cycles = findWaitForCycles([
			{ waiter: 'A', holder: 'B' },
			{ waiter: 'B', holder: 'C' },
			{ waiter: 'C', holder: 'A' },
		]);
		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.agents).toEqual(['A', 'B', 'C']);
	});

	it('normalises the starting point so the same cycle is one entry', () => {
		const cycles = findWaitForCycles([
			{ waiter: 'C', holder: 'A' },
			{ waiter: 'A', holder: 'B' },
			{ waiter: 'B', holder: 'C' },
		]);
		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.agents[0]).toBe('A');
	});

	it('reports two independent deadlocks separately', () => {
		const cycles = findWaitForCycles([
			{ waiter: 'A', holder: 'B' },
			{ waiter: 'B', holder: 'A' },
			{ waiter: 'X', holder: 'Y' },
			{ waiter: 'Y', holder: 'X' },
		]);
		expect(cycles).toHaveLength(2);
	});

	it('does not loop forever on a self-wait', () => {
		// Degenerate, but a torn registry can produce it and it must not
		// hang the diagnostic that exists to explain a hang.
		const cycles = findWaitForCycles([{ waiter: 'A', holder: 'A' }]);
		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.agents).toEqual(['A']);
	});
});
