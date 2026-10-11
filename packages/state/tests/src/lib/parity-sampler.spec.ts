/**
 * parity-sampler.spec.ts — the sampler finds nothing between two honest
 * registries and names each kind of divergence when one is planted.
 */
import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import { sampleParity } from '../../../src/lib/parity-sampler';
import type { TParityRegistryFactory } from '../../../src/lib/parity-sampler.interface';
import type { IStateProducer } from '../../../src/lib/producer';
import { STATE_ABI_VERSION } from '../../../src/lib/fingerprint';
import { sha256BytesHex } from '../../../src/lib/hash';
import type { IHydrateInput } from '../../../src/lib/registry';
import { asWorktreeId } from '../../../src/lib/scope';

const honest: TParityRegistryFactory = (options) =>
	defineInMemoryStateRegistry(options);

/** A driver whose producers are swapped for `tamper(producer)`. */
const tampering =
	(
		tamper: (producer: IStateProducer) => IStateProducer,
	): TParityRegistryFactory =>
	(options) => {
		const registry = defineInMemoryStateRegistry(options);
		const define = registry.defineProducer.bind(registry);
		registry.defineProducer = (producer) => define(tamper(producer));
		return registry;
	};

const base = { runs: 5, operationsPerRun: 40, seed: 7 };

/** An input no generated operation produces: its value is out of range. */
const skewed = (): IHydrateInput => {
	const bytes = new TextEncoder().encode('-5');
	const digest = sha256BytesHex(bytes);
	const spec = { kind: 'file', locator: 'counter.json' } as const;
	return {
		scope: {
			kind: 'project',
			locator: {
				workspaceRoot: '/parity',
				worktreeId: asWorktreeId('wt-parity'),
				cacheRoot: '/parity/.cache',
				docsRoot: '/parity/docs',
			},
		},
		storageIdentity: {
			repositoryInstanceId: 'parity',
			worktreeId: 'wt-parity',
		},
		snapshot: {
			fingerprint: {
				abiVersion: STATE_ABI_VERSION,
				producers: [
					{
						id: 'parity-counter',
						producerVersion: 1,
						abiVersion: STATE_ABI_VERSION,
						inputs: [{ ...spec, digest }],
					},
				],
			},
			contents: new Map([['file|counter.json|', bytes]]),
			declared: [spec],
			byProducer: new Map([
				['parity-counter', [{ spec, digest, content: bytes }]],
			]),
		},
	};
};

describe('sampleParity', () => {
	it('reports no divergence between two registries of the same driver', () => {
		const report = sampleParity({
			...base,
			primary: honest,
			shadow: honest,
		});
		expect(report.operations).toBe(200);
		expect(report.generationsCompared).toBeGreaterThan(0);
		expect(report.driverParityDivergences).toBe(0);
		expect(report.replayDeterminismDivergences).toBe(0);
		expect(report.executionDeterminismDivergences).toBe(0);
		expect(report.divergences).toEqual([]);
	});

	it('is the same sequence for the same seed', () => {
		const once = sampleParity({ ...base, primary: honest, shadow: honest });
		const twice = sampleParity({
			...base,
			primary: honest,
			shadow: honest,
		});
		expect(twice).toEqual(once);
		const other = sampleParity({
			...base,
			seed: 8,
			primary: honest,
			shadow: honest,
		});
		expect(other.generationsCompared).not.toBe(once.generationsCompared);
	});

	it('counts a shadow that computes differently as driver parity only', () => {
		const report = sampleParity({
			...base,
			primary: honest,
			shadow: tampering((producer) => ({
				...producer,
				rebuild: () => ({ canonical: { value: -1 } }),
			})),
		});
		expect(report.driverParityDivergences).toBeGreaterThan(0);
		expect(report.replayDeterminismDivergences).toBe(0);
		expect(report.executionDeterminismDivergences).toBe(0);
		expect(report.divergences[0]?.kind).toBe('driver-parity');
	});

	it('counts a producer that is not a function of its inputs as execution determinism', () => {
		let calls = 0;
		const report = sampleParity({
			...base,
			primary: tampering((producer) => ({
				...producer,
				rebuild: () => {
					calls += 1;
					return { canonical: { value: calls } };
				},
			})),
			shadow: honest,
		});
		expect(report.executionDeterminismDivergences).toBeGreaterThan(0);
		expect(report.replayDeterminismDivergences).toBe(0);
	});
	it('counts a replay that saw other inputs as replay determinism', () => {
		// Every second registry the primary factory builds is the replay;
		// it is handed a different value on each hydrate.
		let built = 0;
		const report = sampleParity({
			...base,
			primary: (options) => {
				const registry = defineInMemoryStateRegistry(options);
				built += 1;
				if (built % 2 === 1) return registry;
				const hydrate = registry.hydrate.bind(registry);
				const incremental = registry.incremental.bind(registry);
				registry.hydrate = () => hydrate(skewed());
				registry.incremental = (_input, change) =>
					incremental(skewed(), change);
				return registry;
			},
			shadow: honest,
		});
		expect(report.replayDeterminismDivergences).toBeGreaterThan(0);
		expect(report.driverParityDivergences).toBe(0);
	});
});
