/**
 * corruption.spec.ts — q00018 Phase 0.1 S3 acceptance #3.
 *
 * Property-based test (fast-check): corruption recovery from a
 * final source snapshot, WITHOUT replaying the operation history.
 *
 * Phase 0.1 fix: the previous version simulated corruption by
 * calling `resetForTests()` and then replaying every operation a
 * second time. That demonstrates "I can rebuild if I keep the
 * history". The new test demonstrates the actual invariant:
 *
 *   "If I delete the entire registry, then `hydrate()` on the
 *    same final source snapshot yields the same canonical hash
 *    as a healthy registry that watched every step."
 *
 * The point is that corruption recovery MUST NOT depend on the
 * history. It depends only on the source snapshot the host
 * hands in.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { canonicalStateHash } from '../../../src/lib/hash';
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import type {
	IStateInputSnapshot,
	ProducerContext,
	ProjectionResult,
	IStateProducer,
} from '../../../src/lib/producer';
import {
	STATE_ABI_VERSION,
	type CanonicalProjectFingerprint,
} from '../../../src/lib/fingerprint';
import type { StateScope } from '../../../src/lib/scope';
import { asWorktreeId } from '../../../src/lib/scope';
import type { IHydrateInput } from '../../../src/lib/registry';

interface ListModel {
	items: string[];
}

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

function snapshotForList(
	items: string[],
	fingerprint: CanonicalProjectFingerprint,
): IStateInputSnapshot {
	return {
		fingerprint,
		contents: new Map([
			['items', new TextEncoder().encode(JSON.stringify(items))],
		]),
		declared: [],
	};
}

function buildFromSnapshotProducer(): IStateProducer {
	return {
		id: 'list',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(ctx: ProducerContext): ProjectionResult {
			const raw = ctx.snapshot.contents.get('items');
			if (!raw) return { canonical: { items: [] } };
			const items = JSON.parse(new TextDecoder().decode(raw)) as string[];
			return { canonical: { items } };
		},
		reconcile(): ProjectionResult {
			throw new Error('clean path must not call reconcile');
		},
	};
}

function buildReconcileProducer(): IStateProducer {
	return {
		id: 'list',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(): ProjectionResult {
			return { canonical: { items: [] as string[] } };
		},
		reconcile(ctx: ProducerContext, change): ProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { items: [] }) as {
				items: string[];
			};
			if (change.kind === 'add') {
				const items = [...base.items, String(change.value)];
				return { canonical: { items } };
			}
			return { canonical: { items: base.items } };
		},
	};
}

const NUM_RUNS = Number(process.env.STATE_PROPERTY_RUNS ?? 200);

describe('Property: corruption recovery WITHOUT replay (q00018 S3)', () => {
	it(`rebuilds from final snapshot over ${NUM_RUNS} sequences`, () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.string({ minLength: 1, maxLength: 4, unit: 'grapheme' }),
					{
						minLength: 1,
						maxLength: 20,
					},
				),
				(values) => {
					const fp: CanonicalProjectFingerprint = {
						abiVersion: STATE_ABI_VERSION,
						producers: [
							{
								id: 'list',
								producerVersion: 1,
								abiVersion: STATE_ABI_VERSION,
								inputs: [],
							},
						],
					};
					const finalItems: ListModel = { items: [...values] };

					// === Healthy registry: replay every step ===
					const rHealthy = defineInMemoryStateRegistry({
						clock: () => 0,
					});
					rHealthy.defineProducer(buildReconcileProducer());
					const initSnap = snapshotForList([], fp);
					const h0 = rHealthy.hydrate({
						scope,
						storageIdentity: {
							repositoryInstanceId: 'r',
							worktreeId: 'wt-A',
						},
						snapshot: initSnap,
					} satisfies IHydrateInput);
					expect(h0.ok).toBe(true);
					if (!h0.ok) return false;
					for (const v of values) {
						const r = rHealthy.incremental(
							{
								scope,
								storageIdentity: {
									repositoryInstanceId: 'r',
									worktreeId: 'wt-A',
								},
								snapshot: snapshotForList([], fp),
							} satisfies IHydrateInput,
							{ kind: 'add', value: v },
						);
						expect(r.ok).toBe(true);
						if (!r.ok) return false;
					}
					const readHealthy = rHealthy.lookup({
						scope,
						producerId: 'list',
					});
					expect(readHealthy.ok).toBe(true);
					if (!readHealthy.ok) return false;
					const hashHealthy = canonicalStateHash(
						readHealthy.projection,
					);

					// === Corrupted registry: full reset, rebuild from final snapshot ===
					const rCorrupt = defineInMemoryStateRegistry({
						clock: () => 0,
					});
					rCorrupt.defineProducer(buildFromSnapshotProducer());
					const hReb = rCorrupt.hydrate({
						scope,
						storageIdentity: {
							repositoryInstanceId: 'r',
							worktreeId: 'wt-A',
						},
						snapshot: snapshotForList(finalItems.items, fp),
					} satisfies IHydrateInput);
					expect(hReb.ok).toBe(true);
					if (!hReb.ok) return false;
					const readReb = rCorrupt.lookup({
						scope,
						producerId: 'list',
					});
					expect(readReb.ok).toBe(true);
					if (!readReb.ok) return false;
					const hashReb = canonicalStateHash(readReb.projection);

					expect(hashHealthy).toBe(hashReb);
					return hashHealthy === hashReb;
				},
			),
			{ numRuns: NUM_RUNS },
		);
	}, 60_000);
});
