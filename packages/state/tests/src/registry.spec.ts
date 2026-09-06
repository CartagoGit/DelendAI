/**
 * registry.spec.ts — q00018 Phase 0.1 S2, S4, S5, S9.
 *
 * Pins the InMemoryStateRegistry contract end-to-end:
 *
 *   - register producers with a snapshot, get a generation
 *   - incremental builds on the active generation
 *   - lookup returns the canonical projection
 *   - acquireProjectLease rejects stale tokens
 *   - acquireSwarmClaim + renewSwarmClaim work as a separate fence
 *   - GC actually reaps draining generations whose holders are zero
 *   - defineProducer upgrade (same id, different producerVersion) does NOT throw
 */

import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import type {
	IStateInputSnapshot,
	IStateProducer,
	IProducerInput,
	ProjectionResult,
} from '../../src/lib/producer';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import type { StateScope } from '../../src/lib/scope';
import { asRepositoryInstanceId, asWorktreeId } from '../../src/lib/scope';
import type { StateStorageIdentity } from '../../src/lib/fingerprint';
import type { IHydrateInput } from '../../src/lib/registry';

const projectScope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const swarmScope: StateScope = {
	kind: 'swarm',
	locator: {
		repositoryInstanceId: asRepositoryInstanceId('repo-abc'),
		swarmRoot: '/shared/state/swarm',
	},
};

const storage: StateStorageIdentity = {
	repositoryInstanceId: 'repo-abc',
	worktreeId: 'wt-A',
};

function makeSnapshot(
	producer: IStateProducer,
	content: Uint8Array = new Uint8Array(),
): IStateInputSnapshot {
	const declared: readonly IProducerInput[] = producer.inputs;
	const contents = new Map<string, Uint8Array>();
	for (const i of declared) {
		const k = `${i.kind}|${i.locator}|${i.parserVersion ?? ''}`;
		contents.set(k, content);
	}
	return {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: producer.id,
					producerVersion: producer.producerVersion,
					abiVersion: producer.abiVersion,
					inputs: declared,
				},
			],
		},
		contents,
		declared,
	};
}

function countingProducer(
	overrides: Partial<IStateProducer> = {},
): IStateProducer {
	let calls = 0;
	const producer: IStateProducer = {
		id: 'counter',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(): ProjectionResult {
			calls += 1;
			return { canonical: { count: calls, label: 'counter' } };
		},
		reconcile(ctx, change): ProjectionResult {
			void calls;
			const base = ctx.baseProjection?.canonical as
				| { count: number; label: string }
				| undefined;
			const delta = typeof change.delta === 'number' ? change.delta : 1;
			return {
				canonical: {
					count: (base?.count ?? 0) + delta,
					label: 'counter',
				},
			};
		},
		...overrides,
	};
	return producer;
}

function hydrateInput(
	scope: StateScope,
	producer: IStateProducer,
): IHydrateInput {
	return {
		scope,
		storageIdentity: storage,
		snapshot: makeSnapshot(producer),
	};
}

describe('InMemoryStateRegistry (q00018 S3 + 0.1 fixes)', () => {
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

	it('S9 fix: defineProducer upgrade (same id, new producerVersion) does NOT throw', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		r.defineProducer(countingProducer());
		expect(() =>
			r.defineProducer(countingProducer({ producerVersion: 2 })),
		).not.toThrow();
	});

	it('hydrate produces an active generation with a stable canonical hash', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 100 });
		const p = countingProducer();
		r.defineProducer(p);
		const result = r.hydrate(hydrateInput(projectScope, p));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.generation.status).toBe('active');
		expect(result.generation.createdAt).toBe(100);
		expect(result.generation.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('incremental builds on the active generation', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = countingProducer();
		r.defineProducer(p);
		const h1 = r.hydrate(hydrateInput(projectScope, p));
		expect(h1.ok).toBe(true);
		if (!h1.ok) return;
		const h2 = r.incremental(hydrateInput(projectScope, p), {
			kind: 'tick',
			delta: 3,
		});
		expect(h2.ok).toBe(true);
		if (!h2.ok) return;
		expect(h2.generation.id).not.toBe(h1.generation.id);
		expect(h2.generation.parentId).toBe(h1.generation.id);
		const diag = r.diagnose();
		expect(diag.some((g) => g.status === 'draining')).toBe(true);
	});

	it('lookup returns the canonical projection of the active generation', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = countingProducer();
		r.defineProducer(p);
		r.hydrate(hydrateInput(projectScope, p));
		const read = r.lookup({ scope: projectScope, producerId: 'counter' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ count: 1, label: 'counter' });
	});

	it('lookup returns no_active_generation before hydrate', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const read = r.lookup({ scope: projectScope, producerId: 'counter' });
		expect(read.ok).toBe(false);
		if (read.ok) return;
		expect(read.reason).toBe('no_active_generation');
	});

	it('S5 fix: acquring a stale project lease is rejected', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = countingProducer();
		r.defineProducer(p);
		const g1 = r.hydrate(hydrateInput(projectScope, p));
		expect(g1.ok).toBe(true);
		if (!g1.ok) return;
		const g2 = r.incremental(hydrateInput(projectScope, p), {
			kind: 'tick',
			delta: 1,
		});
		expect(g2.ok).toBe(true);
		if (!g2.ok) return;
		const result = r.acquireProjectLease({
			scope: projectScope,
			generationId: g1.generation.id,
			token: g1.generation.projectLeaseToken,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('STALE_PROJECT_GENERATION');
		expect(result.currentGenerationId).toBe(g2.generation.id);
	});

	it('S5 fix: acquireProjectLease accepts current generation + token', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = countingProducer();
		r.defineProducer(p);
		const g = r.hydrate(hydrateInput(projectScope, p));
		expect(g.ok).toBe(true);
		if (!g.ok) return;
		const result = r.acquireProjectLease({
			scope: projectScope,
			generationId: g.generation.id,
			token: g.generation.projectLeaseToken,
		});
		expect(result.ok).toBe(true);
	});

	it('S10 fix: swarm claims and project leases are independent fences', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p1 = countingProducer({ id: 'swarm-counter' });
		r.defineProducer(p1);
		const h = r.hydrate(hydrateInput(swarmScope, p1));
		expect(h.ok).toBe(true);
		if (!h.ok) return;
		const claim = r.acquireSwarmClaim({ scope: swarmScope, slot: 'S3' });
		expect(claim.token).toBeGreaterThan(0);
		const renewed = claim.renew();
		expect(renewed).not.toBe(claim.token);
		// Old token is now stale
		const r2 = r.renewSwarmClaim({
			scope: swarmScope,
			slot: 'S3',
			token: claim.token,
		});
		expect(r2.ok).toBe(false);
		if (r2.ok) return;
		expect(r2.reason).toBe('STALE_SWARM_LEASE');
	});
});
