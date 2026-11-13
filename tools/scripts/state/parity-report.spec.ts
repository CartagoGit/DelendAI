/**
 * parity-report.spec.ts — the sampler's arguments and its one line.
 */
import { describe, expect, it } from 'vitest';

import type { IParityReport } from '@delendai/state';

import { diverged, numberArg, summarise } from './parity-report';

const clean: IParityReport = {
	seed: 42,
	runs: 2,
	operations: 100,
	generationsCompared: 17,
	driverParityDivergences: 0,
	replayDeterminismDivergences: 0,
	executionDeterminismDivergences: 0,
	divergences: [],
};

describe('numberArg', () => {
	it('reads a positive integer', () => {
		expect(numberArg(['--runs=7'], 'runs', 20)).toBe(7);
	});

	it('falls back when absent, zero, negative or not a number', () => {
		expect(numberArg([], 'runs', 20)).toBe(20);
		expect(numberArg(['--runs=0'], 'runs', 20)).toBe(20);
		expect(numberArg(['--runs=-3'], 'runs', 20)).toBe(20);
		expect(numberArg(['--runs=many'], 'runs', 20)).toBe(20);
	});

	it('does not read another flag that starts the same', () => {
		expect(numberArg(['--runs-total=9'], 'runs', 20)).toBe(20);
	});
});

describe('summarise and diverged', () => {
	it('says the three counts apart', () => {
		expect(summarise(clean)).toContain(
			'driver parity 0, replay determinism 0, execution determinism 0',
		);
		expect(summarise(clean)).toContain(
			'100 operations in 2 run(s), seed 42',
		);
		expect(diverged(clean)).toBe(false);
	});

	it('fails its caller on any divergence', () => {
		expect(
			diverged({
				...clean,
				driverParityDivergences: 1,
				divergences: [
					{
						kind: 'driver-parity',
						run: 0,
						generationId: 'g000001-0001',
					},
				],
			}),
		).toBe(true);
	});
});
