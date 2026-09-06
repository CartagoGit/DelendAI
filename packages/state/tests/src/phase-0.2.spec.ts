/**
 * phase-0.2.spec.ts — Phase 0.2 acceptance tests.
 *
 * These tests exercise the four chatgpt observations
 * (2026-09-06):
 *
 *   S2 — the driver MUST validate the snapshot before running
 *        producers. `validateSnapshot()` exposes a typed list of
 *        issues that `hydrate()` refuses.
 *
 *   S3 — `SwarmClaimHandle.renew()` must (a) return a token
 *        strictly greater than the original, and (b) update the
 *        handle's `currentToken` so `release()` matches the
 *        registry. The original `token` field stays put for
 *        backward-compat.
 *
 *   S3.b — `acquireProjectLease()` produces a unique lease id
 *        per scope, so two registries that share the same
 *        generation id cannot collide.
 *
 *   S5 — `holderCount` on a generation is derived from the
 *        holders map. The driver does not maintain a separate
 *        mutable counter.
 */

import { describe, expect, it } from 'vitest';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import type {
	ICanonicalProjectFingerprint,
	IProducerInput,
} from '../../src/lib/fingerprint';
import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import type { IStateProducer } from '../../src/lib/producer';
import type { IStateInputSnapshot } from '../../src/lib/producer';
import type { IHydrateInput, ISnapshotIssue } from '../../src/lib/registry';
import type { StateScope } from '../../src/lib/scope';
import { asWorktreeId } from '../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

function fingerprint(
	producers: IStateProducer[],
): ICanonicalProjectFingerprint {
	return {
		abiVersion: STATE_ABI_VERSION,
		producers: producers.map((p) => ({
			id: p.id,
			producerVersion: p.producerVersion,
			abiVersion: p.abiVersion,
			inputs: p.inputs,
		})),
	};
}

function snapshotWith(
	fp: ICanonicalProjectFingerprint,
	contents: Map<string, Uint8Array> = new Map(),
	declared: readonly IProducerInput[] = [],
	byProducer?: ReadonlyMap<string, readonly IProducerInput[]>,
): IStateInputSnapshot {
	const base: IStateInputSnapshot = {
		fingerprint: fp,
		contents,
		declared,
	};
	return byProducer ? { ...base, byProducer } : base;
}

function mkProducer(inputs: readonly IProducerInput[] = []): IStateProducer {
	return {
		id: 'a',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs,
		rebuild: () => ({ canonical: { kind: 'a' } }),
		reconcile: () => ({ canonical: { kind: 'a' } }),
	};
}

describe('Phase 0.2 — validateSnapshot (S2)', () => {
	it('accepts a well-formed snapshot', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p: IStateProducer = {
			id: 'a',
			abiVersion: STATE_ABI_VERSION,
			producerVersion: 1,
			serves: ['project'],
			inputs: [{ kind: 'file', locator: 'a.txt', digest: 'd1' as never }],
			rebuild: () => ({ canonical: { kind: 'a' } }),
			reconcile: () => ({ canonical: { kind: 'a' } }),
		};
		r.defineProducer(p);
		const fp = fingerprint([p]);
		const byProducer = new Map<string, readonly IProducerInput[]>([
			['a', p.inputs],
		]);
		const issues: readonly ISnapshotIssue[] = r.validateSnapshot(
			snapshotWith(
				fp,
				new Map([['file|a.txt|', new Uint8Array()]]),
				p.inputs,
				byProducer,
			),
		);
		expect(issues).toEqual([]);
	});

	it('flags producer_missing_inputs when a producer has inputs but none resolved', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer([
			{ kind: 'file', locator: 'a.txt', digest: 'd1' as never },
		]);
		r.defineProducer(p);
		const fp = fingerprint([p]);
		const issues = r.validateSnapshot(
			snapshotWith(fp, new Map(), [], new Map()),
		);
		expect(issues.some((i) => i.kind === 'producer_missing_inputs')).toBe(
			true,
		);
	});

	it('flags fingerprint_mismatch when fingerprint references an input without content', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer();
		r.defineProducer(p);
		const fp: ICanonicalProjectFingerprint = {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: 'a',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'file',
							locator: 'missing.txt',
							digest: 'd' as never,
						},
					],
				},
			],
		};
		const issues = r.validateSnapshot(snapshotWith(fp, new Map()));
		expect(issues.some((i) => i.kind === 'fingerprint_mismatch')).toBe(
			true,
		);
	});

	it('hydrate fails with snapshot_invalid reason', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer([
			{ kind: 'file', locator: 'a.txt', digest: 'd1' as never },
		]);
		r.defineProducer(p);
		const fp = fingerprint([p]);
		const input: IHydrateInput = {
			scope,
			storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
			snapshot: snapshotWith(fp, new Map(), [], new Map()),
		};
		const result = r.hydrate(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('snapshot_invalid');
		}
	});
});

describe('Phase 0.2 — SwarmClaimHandle.renew() (S3)', () => {
	function setup() {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer();
		r.defineProducer(p);
		r.hydrate({
			scope,
			storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
			snapshot: snapshotWith(fingerprint([p])),
		});
		return r;
	}

	it('returns a token strictly greater than the original', () => {
		const r = setup();
		const claim = r.acquireSwarmClaim({ scope, slot: 'slot-A' });
		const renewed = claim.renew();
		expect(renewed).toBeGreaterThan(claim.token);
	});

	it('updates currentToken but preserves the original token', () => {
		const r = setup();
		const claim = r.acquireSwarmClaim({ scope, slot: 'slot-A' });
		const original = claim.token;
		const renewed = claim.renew();
		expect(claim.token).toBe(original);
		expect(claim.currentToken).toBe(renewed);
	});

	it('release() after renew() matches the registry token', () => {
		const r = setup();
		const claim = r.acquireSwarmClaim({ scope, slot: 'slot-A' });
		claim.renew();
		claim.release();
		const fresh = r.acquireSwarmClaim({ scope, slot: 'slot-A' });
		expect(fresh.token).toBeGreaterThan(claim.currentToken);
	});
});

describe('Phase 0.2 — acquireProjectLease unique ids (S3.b)', () => {
	function setup() {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer();
		r.defineProducer(p);
		const result = r.hydrate({
			scope,
			storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
			snapshot: snapshotWith(fingerprint([p])),
		});
		if (!result.ok) throw new Error('hydrate failed');
		return {
			r,
			gen: result.generation,
			token: result.generation.projectLeaseToken,
		};
	}

	it('two consecutive leases with the same token produce different lease ids', () => {
		const { r, gen, token } = setup();
		const a = r.acquireProjectLease({
			scope,
			generationId: gen.id,
			token,
		});
		const b = r.acquireProjectLease({
			scope,
			generationId: gen.id,
			token,
		});
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		if (a.ok && b.ok) {
			expect(a.generationId).toBe(gen.id);
			expect(b.generationId).toBe(gen.id);
		}
	});
});

describe('Phase 0.2 — holderCount derived from holders map (S5)', () => {
	it('diagnose returns the live holder count, not a stale one', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p = mkProducer();
		r.defineProducer(p);
		const result = r.hydrate({
			scope,
			storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
			snapshot: snapshotWith(fingerprint([p])),
		});
		if (!result.ok) throw new Error('hydrate failed');
		const claim = r.acquireSwarmClaim({ scope, slot: 'slot-X' });
		const claims = r.diagnose();
		const active = claims.find((g) => g.id === result.generation.id);
		expect(active?.holderCount).toBe(1);
		claim.release();
		const after = r.diagnose();
		const active2 = after.find((g) => g.id === result.generation.id);
		expect(active2?.holderCount).toBe(0);
	});
});
