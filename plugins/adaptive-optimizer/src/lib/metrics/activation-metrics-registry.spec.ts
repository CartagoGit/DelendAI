import { describe, expect, it } from 'vitest';

import { createActivationMetricsRegistry } from './activation-metrics-registry';

describe('createActivationMetricsRegistry', () => {
	it('reports an explicit no-samples state before any activation', () => {
		const registry = createActivationMetricsRegistry();
		expect(registry.snapshot()).toEqual({
			activations: 0,
			responses: { hasSamples: false },
		});
	});

	it('never coerces the no-samples state into a numeric zero', () => {
		const registry = createActivationMetricsRegistry();
		const { responses } = registry.snapshot();
		expect(responses).not.toHaveProperty('p95PayloadBytes');
	});

	it('reports a finite p95 once activations are recorded', () => {
		const registry = createActivationMetricsRegistry();
		for (const bytes of [50, 150, 250]) {
			registry.recordActivation(bytes);
		}
		const snapshot = registry.snapshot();
		expect(snapshot.activations).toBe(3);
		expect(snapshot.responses.hasSamples).toBe(true);
		if (snapshot.responses.hasSamples) {
			expect(Number.isFinite(snapshot.responses.p95PayloadBytes)).toBe(
				true,
			);
		}
	});

	it('reset() returns the registry to the no-samples state', () => {
		const registry = createActivationMetricsRegistry();
		registry.recordActivation(10);
		registry.reset();
		expect(registry.snapshot()).toEqual({
			activations: 0,
			responses: { hasSamples: false },
		});
	});
});
