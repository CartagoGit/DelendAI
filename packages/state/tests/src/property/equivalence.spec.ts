/**
 * equivalence.spec.ts — q00018 Phase 0.1 S3 acceptance #1.
 *
 * Property-based test (fast-check): `incremental` ≡ `cleanRebuild`.
 *
 * Phase 0.1 fix: the previous version compared two registries that
 * EACH replayed the same operations. That demonstrates replay
 * determinism, NOT incremental equivalence. The new version
 * compares:
 *
 *   - registry A: hydrate(S0) → incremental(op1) → ... →
 *     incremental(opN)     (canonical hash A)
 *
 *   - registry B: hydrate(finalSourceSnapshot)  (no replay at all)
 *     (canonical hash B)
 *
 * If A === B across thousands of random op sequences, the
 * incremental path actually converges to the clean rebuild.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { canonicalStateHash } from '../../../src/lib/hash';
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import type {
	IStateInputSnapshot,
	IStateChange,
	ProducerContext,
	ProjectionResult,
	ProjectionValidator,
	IStateProducer,
} from '../../../src/lib/producer';
import { fingerprintFromProducers } from '../../../src/lib/producer';
import type { StateScope } from '../../../src/lib/scope';
import { asWorktreeId } from '../../../src/lib/scope';
import {
	STATE_ABI_VERSION,
	type CanonicalProjectFingerprint,
} from '../../../src/lib/fingerprint';
import type { IHydrateInput } from '../../../src/lib/registry';

interface KvModel {
	kv: Map<string, number>;
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

function buildKvProducer(): IStateProducer {
	return {
		id: 'kv',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(): ProjectionResult {
			return { canonical: { entries: [] as Array<[string, number]> } };
		},
		reconcile(
			ctx: ProducerContext,
			change: IStateChange,
		): ProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { entries: [] }) as {
				entries: Array<[string, number]>;
			};
			const entries: Array<[string, number]> = [...base.entries];
			if (change.kind === 'set') {
				const key = String(change.key);
				const value = Number(change.value);
				const idx = entries.findIndex(([k]) => k === key);
				if (idx >= 0) entries[idx] = [key, value];
				else entries.push([key, value]);
			} else if (change.kind === 'delete') {
				const key = String(change.key);
				const idx = entries.findIndex(([k]) => k === key);
				if (idx >= 0) entries.splice(idx, 1);
			} else if (change.kind === 'rename') {
				const from = String(change.from);
				const to = String(change.to);
				const idx = entries.findIndex(([k]) => k === from);
				if (idx >= 0) {
					const value = entries[idx]?.[1] ?? 0;
					entries[idx] = [to, value];
				}
			}
			// Always sort so the canonical hash is order-insensitive.
			entries.sort(([a], [b]) => a.localeCompare(b));
			return { canonical: { entries } };
		},
	};
}

const keyArb = fc.string({ minLength: 1, maxLength: 8, unit: 'grapheme' });
const valueArb = fc.integer({ min: -100, max: 100 });
const setArb = fc.record({
	kind: fc.constant('set'),
	key: keyArb,
	value: valueArb,
});
const deleteArb = fc.record({ kind: fc.constant('delete'), key: keyArb });
const renameArb = fc.record({
	kind: fc.constant('rename'),
	from: keyArb,
	to: keyArb,
});
const noopArb = fc.record({ kind: fc.constant('noop') });

const opArb = fc.oneof(
	setArb,
	deleteArb,
	renameArb,
	noopArb,
) as fc.Arbitrary<IStateChange>;

// Snapshot helper: the source model is the KV map. The snapshot's
// "contents" carry a JSON serialisation of the map; the host
// resolver passes it through.
function snapshotForKv(
	kv: KvModel,
	fingerprint: CanonicalProjectFingerprint,
): IStateInputSnapshot {
	const json = JSON.stringify(Array.from(kv.kv.entries()).sort());
	return {
		fingerprint,
		contents: new Map([['json', new TextEncoder().encode(json)]]),
		declared: [],
	};
}

const NUM_RUNS = Number(process.env.STATE_PROPERTY_RUNS ?? 200);

describe('Property: incremental ≡ clean rebuild from final snapshot (q00018 S3)', () => {
	it(`matches over ${NUM_RUNS} random op sequences`, () => {
		fc.assert(
			fc.property(
				fc.array(opArb, { minLength: 1, maxLength: 30 }),
				(ops) => {
					const finalKv: KvModel = { kv: new Map() };

					// ===== Registry A: incremental =====
					const rInc = defineInMemoryStateRegistry({
						clock: () => 0,
					});
					const pInc = buildKvProducer();
					rInc.defineProducer(pInc);
					const fpInc: CanonicalProjectFingerprint = {
						abiVersion: STATE_ABI_VERSION,
						producers: [
							{
								id: 'kv',
								producerVersion: 1,
								abiVersion: STATE_ABI_VERSION,
								inputs: [],
							},
						],
					};
					const h0Inc = rInc.hydrate({
						scope,
						storageIdentity: {
							repositoryInstanceId: 'r',
							worktreeId: 'wt-A',
						},
						snapshot: snapshotForKv({ kv: new Map() }, fpInc),
					} satisfies IHydrateInput);
					expect(h0Inc.ok).toBe(true);
					if (!h0Inc.ok) return false;
					for (const op of ops) {
						if (op.kind === 'set') {
							finalKv.kv.set(String(op.key), Number(op.value));
						} else if (op.kind === 'delete') {
							finalKv.kv.delete(String(op.key));
						} else if (op.kind === 'rename') {
							const v = finalKv.kv.get(String(op.from));
							if (v !== undefined) {
								finalKv.kv.delete(String(op.from));
								finalKv.kv.set(String(op.to), v);
							}
						}
						const r = rInc.incremental(
							{
								scope,
								storageIdentity: {
									repositoryInstanceId: 'r',
									worktreeId: 'wt-A',
								},
								snapshot: snapshotForKv(
									{ kv: new Map() },
									fpInc,
								),
							} satisfies IHydrateInput,
							op,
						);
						expect(r.ok).toBe(true);
						if (!r.ok) return false;
					}
					const readInc = rInc.lookup({ scope, producerId: 'kv' });
					expect(readInc.ok).toBe(true);
					if (!readInc.ok) return false;
					const hashInc = canonicalStateHash(readInc.projection);

					// ===== Registry B: rebuild from final snapshot, NO replay =====
					const rReb = defineInMemoryStateRegistry({
						clock: () => 0,
					});
					const pReb: IStateProducer = {
						id: 'kv',
						abiVersion: STATE_ABI_VERSION,
						producerVersion: 1,
						serves: ['project'],
						inputs: [],
						rebuild(ctx: ProducerContext): ProjectionResult {
							// Read the final KV from the snapshot.
							const raw = ctx.snapshot.contents.get('json');
							if (!raw) return { canonical: { entries: [] } };
							const parsed = JSON.parse(
								new TextDecoder().decode(raw),
							) as Array<[string, number]>;
							const entries: Array<[string, number]> = parsed
								.map(
									([k, v]) =>
										[k, Number(v)] as [string, number],
								)
								.sort(([a], [b]) => a.localeCompare(b));
							return { canonical: { entries } };
						},
						reconcile(): ProjectionResult {
							throw new Error(
								'clean rebuild path must never call reconcile',
							);
						},
					};
					rReb.defineProducer(pReb);
					const fpReb: CanonicalProjectFingerprint = {
						abiVersion: STATE_ABI_VERSION,
						producers: [
							{
								id: 'kv',
								producerVersion: 1,
								abiVersion: STATE_ABI_VERSION,
								inputs: [],
							},
						],
					};
					const hReb = rReb.hydrate({
						scope,
						storageIdentity: {
							repositoryInstanceId: 'r',
							worktreeId: 'wt-A',
						},
						snapshot: snapshotForKv(finalKv, fpReb),
					} satisfies IHydrateInput);
					expect(hReb.ok).toBe(true);
					if (!hReb.ok) return false;
					const readReb = rReb.lookup({ scope, producerId: 'kv' });
					expect(readReb.ok).toBe(true);
					if (!readReb.ok) return false;
					const hashReb = canonicalStateHash(readReb.projection);

					expect(hashInc).toBe(hashReb);
					return hashInc === hashReb;
				},
			),
			{ numRuns: NUM_RUNS },
		);
	}, 60_000);
});
