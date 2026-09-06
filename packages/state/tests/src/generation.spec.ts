/**
 * generation.spec.ts — q00018 Phase 0.1 S5.
 *
 * Pins generation lifecycle: building → active → draining →
 * reaped, with verifiable GC. Holders are refcounted; releasing
 * them reaps the generation when its count reaches zero.
 */

import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import type {
	IStateInputSnapshot,
	IStateProducer,
	ProjectionResult,
} from '../../src/lib/producer';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import type { StateScope } from '../../src/lib/scope';
import { asWorktreeId } from '../../src/lib/scope';
import type { StateStorageIdentity } from '../../src/lib/fingerprint';
import type { IHydrateInput } from '../../src/lib/registry';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const storage: StateStorageIdentity = {
	repositoryInstanceId: 'repo-abc',
	worktreeId: 'wt-A',
};

function trivial(): IStateProducer {
	return {
		id: 'p',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild: () => ({ canonical: { ok: true } }),
		reconcile: () => ({ canonical: { ok: true } }),
	};
}

function makeSnapshot(producer: IStateProducer): IStateInputSnapshot {
	return {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: producer.id,
					producerVersion: producer.producerVersion,
					abiVersion: producer.abiVersion,
					inputs: producer.inputs,
				},
			],
		},
		contents: new Map(),
		declared: producer.inputs,
	};
}

function input(scope_: StateScope, producer: IStateProducer): IHydrateInput {
	return {
		scope: scope_,
		storageIdentity: storage,
		snapshot: makeSnapshot(producer),
	};
}

describe('StateGeneration (q00018 S5)', () => {
	it('publishes the first generation with status=active', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = trivial();
		r.defineProducer(p);
		const h = r.hydrate(input(scope, p));
		expect(h.ok).toBe(true);
		if (!h.ok) return;
		expect(h.generation.status).toBe('active');
	});

	it('drains the previous generation on each new publish', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = trivial();
		r.defineProducer(p);
		const g1 = r.hydrate(input(scope, p));
		expect(g1.ok).toBe(true);
		if (!g1.ok) return;
		const g2 = r.incremental(input(scope, p), { kind: 'noop' });
		expect(g2.ok).toBe(true);
		if (!g2.ok) return;
		const all = r.diagnose();
		const statuses = all.map((g) => `${g.id}:${g.status}`).sort();
		expect(statuses).toContain(`${g1.generation.id}:draining`);
		expect(statuses).toContain(`${g2.generation.id}:active`);
	});

	it('projectLeaseToken strictly increases between publishes', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = trivial();
		r.defineProducer(p);
		const g1 = r.hydrate(input(scope, p));
		const g2 = r.incremental(input(scope, p), { kind: 'noop' });
		const g3 = r.incremental(input(scope, p), { kind: 'noop' });
		expect(g1.ok && g2.ok && g3.ok).toBe(true);
		if (!g1.ok || !g2.ok || !g3.ok) return;
		expect(g2.generation.projectLeaseToken).toBeGreaterThan(
			g1.generation.projectLeaseToken,
		);
		expect(g3.generation.projectLeaseToken).toBeGreaterThan(
			g2.generation.projectLeaseToken,
		);
	});

	it('S5 fix: GC actually reaps generations whose holders hit zero', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = trivial();
		r.defineProducer(p);
		const g1 = r.hydrate(input(scope, p));
		expect(g1.ok).toBe(true);
		if (!g1.ok) return;
		const g2 = r.incremental(input(scope, p), { kind: 'noop' });
		expect(g2.ok).toBe(true);
		if (!g2.ok) return;
		// Acquire a project lease against g2 so the registry has a
		// real holder to track. g1 should already be draining with
		// no holders (drained on publish).
		const lease = r.acquireProjectLease({
			scope,
			generationId: g2.generation.id,
			token: g2.generation.projectLeaseToken,
		});
		expect(lease.ok).toBe(true);
		if (lease.ok) {
			r.releaseProjectLease({
				scope,
				leaseId: `project:${g2.generation.id}:${String(g2.generation.projectLeaseToken)}`,
			});
		}
		const reaped = r.gc(scope);
		expect(reaped).toBeGreaterThanOrEqual(1);
		// The active generation MUST remain
		const ids = r.diagnose().map((g) => g.id);
		expect(ids).toContain(g2.generation.id);
	});
});
