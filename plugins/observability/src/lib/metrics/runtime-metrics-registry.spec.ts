import { describe, expect, it } from 'vitest';

import { createRuntimeMetricsRegistry } from './runtime-metrics-registry';

describe('createRuntimeMetricsRegistry', () => {
	it('reports an explicit no-samples state before anything is recorded', () => {
		const registry = createRuntimeMetricsRegistry();
		expect(registry.snapshot()).toEqual({
			calls: 0,
			responses: { hasSamples: false },
		});
	});

	it('never coerces the no-samples state into a numeric zero', () => {
		const registry = createRuntimeMetricsRegistry();
		const { responses } = registry.snapshot();
		expect(responses).not.toHaveProperty('p95PayloadBytes');
	});

	it('reports a finite p95 once samples are recorded', () => {
		const registry = createRuntimeMetricsRegistry();
		for (const bytes of [100, 200, 300, 400, 500]) {
			registry.recordResponseBytes(bytes);
		}
		const snapshot = registry.snapshot();
		expect(snapshot.calls).toBe(5);
		expect(snapshot.responses.hasSamples).toBe(true);
		if (snapshot.responses.hasSamples) {
			expect(Number.isFinite(snapshot.responses.p95PayloadBytes)).toBe(
				true,
			);
			expect(snapshot.responses.p95PayloadBytes).toBe(500);
		}
	});

	it('reset() returns the registry to the no-samples state', () => {
		const registry = createRuntimeMetricsRegistry();
		registry.recordResponseBytes(42);
		registry.reset();
		expect(registry.snapshot()).toEqual({
			calls: 0,
			responses: { hasSamples: false },
		});
	});
});
