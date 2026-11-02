/**
 * driver-parity.spec.ts — the in-memory and the SQLite registries agree
 * over a thousand random operations, leases and claims included.
 */
import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry, sampleParity } from '@delendai/state';

import { defineSqliteStateRegistry } from './sqlite-driver';

describe('driver parity', () => {
	it('finds no divergence over 1000 random operations', () => {
		const report = sampleParity({
			runs: 20,
			operationsPerRun: 50,
			seed: 20261011,
			primary: defineInMemoryStateRegistry,
			shadow: (options) =>
				defineSqliteStateRegistry({ ...options, path: ':memory:' }),
		});
		expect(report.operations).toBe(1000);
		expect(report.generationsCompared).toBeGreaterThan(0);
		expect(report.divergences).toEqual([]);
	});
});
