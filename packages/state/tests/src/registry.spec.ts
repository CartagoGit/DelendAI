/**
 * registry.spec.ts — q00018 S3 acceptance.
 *
 * Pins the InMemoryStateRegistry contract end-to-end:
 *
 *   - register producers
 *   - compute fingerprint from producers + host inputs
 *   - hydrate produces a generation with canonical hash
 *   - incremental builds on the active generation
 *   - get returns the canonical projection
 *   - fencing rejects stale writers
 */

import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import type {
	IStateProducer,
	IProjectionResult,
	IStateChange,
} from '../../src/lib/producer';
import type { IStateScope } from '../../src/lib/scope';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';

const projectScope: IStateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		cacheRoot: '/repo/.cache/delendai',
	},
};

function countingProducer(
	overrides: Partial<IStateProducer> = {},
): IStateProducer {
	let rebuildCalls = 0;
	let reconcileCalls = 0;
	const producer: IStateProducer = {
		id: 'counter',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(ctx): IProjectionResult {
			rebuildCalls += 1;
			void ctx;
			return {
				canonical: {
					count: rebuildCalls,
					label: 'counter',
				},
			};
		},
		reconcile(ctx, change: IStateChange): IProjectionResult {
			reconcileCalls += 1;
			const base = ctx.baseProjection?.canonical as
				| { count: number; label: string }
				| undefined;
			const count = base?.count ?? 0;
			const delta = typeof change.delta === 'number' ? change.delta : 1;
			return {
				canonical: {
					count: count + delta,
					label: 'counter',
				},
			};
		},
		...overrides,
	};
	void reconcileCalls;
	return producer;
}

describe('InMemoryStateRegistry (q00018 S3)', () => {
	it('rejects ill-formed producers', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		expect(() =>
			r.defineProducer({
				id: '',
				abiVersion: STATE_ABI_VERSION,
				producerVersion: 1,
				serves: ['project'],
				inputs: [],
				rebuild: () => ({ canonical: {} }),
				reconcile: () => ({ canonical: {} }),
			}),
		).toThrow(/ill-formed producer/);
	});

	it('rejects duplicate (id, producerVersion) registrations', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = countingProducer();
		r.defineProducer(p);
		expect(() => r.defineProducer(countingProducer())).toThrow(
			/duplicate producer/,
		);
	});

	it('hydrate produces an active generation with a stable canonical hash', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 100 });
		r.defineProducer(countingProducer());
		const result = r.hydrate({ scope: projectScope });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.generation.status).toBe('active');
		expect(result.generation.createdAt).toBe(100);
		expect(result.generation.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('incremental builds on the active generation', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		const h1 = r.hydrate({ scope: projectScope });
		expect(h1.ok).toBe(true);
		if (!h1.ok) return;
		const h2 = r.incremental(
			{ scope: projectScope },
			{ kind: 'tick', delta: 3 },
		);
		expect(h2.ok).toBe(true);
		if (!h2.ok) return;
		expect(h2.generation.id).not.toBe(h1.generation.id);
		expect(h2.generation.parentId).toBe(h1.generation.id);
		// The previous generation is now draining (still has a record).
		const diag = r.diagnose();
		expect(diag.some((g) => g.status === 'draining')).toBe(true);
	});

	it('get returns the canonical projection of the active generation', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		r.hydrate({ scope: projectScope });
		const read = r.get({ scope: projectScope, producerId: 'counter' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ count: 1, label: 'counter' });
	});

	it('get returns no_active_generation before hydrate', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const read = r.get({ scope: projectScope, producerId: 'counter' });
		expect(read.ok).toBe(false);
		if (read.ok) return;
		expect(read.reason).toBe('no_active_generation');
	});

	it('tryWrite rejects a stale generationId', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		const g1 = r.hydrate({ scope: projectScope });
		expect(g1.ok).toBe(true);
		if (!g1.ok) return;
		const g2 = r.incremental(
			{ scope: projectScope },
			{ kind: 'tick', delta: 1 },
		);
		expect(g2.ok).toBe(true);
		if (!g2.ok) return;
		const result = r.tryWrite({
			scope: projectScope,
			generationId: g1.generation.id,
			leaseToken: g1.generation.leaseToken,
			payload: { canonical: { count: 999, label: 'counter' } },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('STALE_GENERATION');
		expect(result.currentGenerationId).toBe(g2.generation.id);
	});

	it('tryWrite rejects a mismatched lease token', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		const g = r.hydrate({ scope: projectScope });
		expect(g.ok).toBe(true);
		if (!g.ok) return;
		const result = r.tryWrite({
			scope: projectScope,
			generationId: g.generation.id,
			leaseToken: g.generation.leaseToken + 100,
			payload: { canonical: { count: 999, label: 'counter' } },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('LEASE_REVOKED');
	});

	it('tryWrite accepts the current generation + lease and records the payload', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		const g = r.hydrate({ scope: projectScope });
		expect(g.ok).toBe(true);
		if (!g.ok) return;
		const result = r.tryWrite({
			scope: projectScope,
			generationId: g.generation.id,
			leaseToken: g.generation.leaseToken,
			payload: { canonical: { count: 999, label: 'counter' } },
		});
		expect(result.ok).toBe(true);
	});

	it('computeFingerprint sorts producers lexicographically by id', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer({ id: 'b-producer' }));
		r.defineProducer(countingProducer({ id: 'a-producer' }));
		const fp = r.computeFingerprint('salt');
		expect(fp.producers.map((p) => p.id)).toEqual([
			'a-producer',
			'b-producer',
		]);
	});
});
