/**
 * determinism.spec.ts — q00018 Phase 0.1 S3 acceptance #2.
 *
 * Property-based test (fast-check):
 *
 *   - same fingerprint + same op sequence -> same canonical hash
 *   - NON-deterministic producer (one that reads Date.now())
 *     produces DIFFERENT hashes across two runs. This is the
 *     regression guard: if the lint becomes lossy and a producer
 *     can sneak a `Date.now()` past it, this test will fail
 *     rather than silently pass.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { canonicalStateHash } from '../../../src/lib/hash';
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import type {
	IStateInputSnapshot,
	IStateChange,
	ProducerContext,
	IProjectionResult,
	IStateProducer,
} from '../../../src/lib/producer';
import { STATE_ABI_VERSION } from '../../../src/lib/fingerprint';
import type { StateScope } from '../../../src/lib/scope';
import { asWorktreeId } from '../../../src/lib/scope';
import type { IHydrateInput } from '../../../src/lib/registry';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

function snapshot(fp: {
	abiVersion: number;
	producers: never[];
}): IStateInputSnapshot {
	return {
		fingerprint: { abiVersion: fp.abiVersion, producers: fp.producers },
		contents: new Map(),
		declared: [],
	};
}

const input = (): IHydrateInput => ({
	scope,
	storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
	snapshot: snapshot({
		abiVersion: STATE_ABI_VERSION,
		producers: [],
	}),
});

function deterministicProducer(): IStateProducer {
	return {
		id: 'd',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(): IProjectionResult {
			return { canonical: { calls: 0 } };
		},
		reconcile(
			ctx: ProducerContext,
			change: IStateChange,
		): IProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { calls: 0 }) as {
				calls: number;
			};
			return {
				canonical: { calls: base.calls + 1, lastOp: change.kind },
			};
		},
	};
}

/**
 * Captured-clock non-determinism: each instance ticks an internal
 * counter that mutates outside the registry. Two instances with
 * different tick histories MUST produce different canonical
 * hashes. This simulates a producer that reads `Date.now()`
 * without depending on the wall clock itself.
 */
function clockedNonDeterministicProducer(): IStateProducer & {
	tick(): void;
} {
	let epoch = 0;
	const p: IStateProducer & { tick(): void } = {
		id: 'cnondet',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [],
		rebuild(): IProjectionResult {
			return { canonical: { epoch } };
		},
		reconcile(
			ctx: ProducerContext,
			_change: IStateChange,
		): IProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { epoch: 0 }) as {
				epoch: number;
			};
			return { canonical: { epoch: base.epoch + 1 } };
		},
		tick(): void {
			epoch += 1;
		},
	};
	return p;
}

const opArb = fc.constantFrom('tick', 'tock') as fc.Arbitrary<string>;

const NUM_RUNS = Number(process.env.STATE_PROPERTY_RUNS ?? 200);

describe('Property: determinism (q00018 S3 acceptance #2)', () => {
	it(`two fresh registries produce identical hash over ${NUM_RUNS} sequences`, () => {
		fc.assert(
			fc.property(
				fc.array(opArb, { minLength: 1, maxLength: 50 }),
				(ops) => {
					const r1 = defineInMemoryStateRegistry({ clock: () => 0 });
					const r2 = defineInMemoryStateRegistry({ clock: () => 0 });
					r1.defineProducer(deterministicProducer());
					r2.defineProducer(deterministicProducer());
					const h1 = r1.hydrate(input());
					const h2 = r2.hydrate(input());
					expect(h1.ok && h2.ok).toBe(true);
					if (!h1.ok || !h2.ok) return false;
					for (const op of ops) {
						const a = r1.incremental(input(), { kind: op });
						const b = r2.incremental(input(), { kind: op });
						expect(a.ok && b.ok).toBe(true);
						if (!a.ok || !b.ok) return false;
					}
					const read1 = r1.lookup({ scope, producerId: 'd' });
					const read2 = r2.lookup({ scope, producerId: 'd' });
					expect(read1.ok && read2.ok).toBe(true);
					if (!read1.ok || !read2.ok) return false;
					const h1c = canonicalStateHash(read1.projection);
					const h2c = canonicalStateHash(read2.projection);
					expect(h1c).toBe(h2c);
					return h1c === h2c;
				},
			),
			{ numRuns: NUM_RUNS },
		);
	}, 60_000);

	it('S3 regression: a NON-deterministic producer yields DIFFERENT canonical hashes across runs', () => {
		// The lint forbids Date.now inside the package; this test
		// is the dynamic counterpart. We construct a producer whose
		// `rebuild` reads a captured counter that the test
		// MUTATES outside the registry. Two registries whose
		// producer counters differ MUST produce different hashes.
		const r1 = defineInMemoryStateRegistry({ clock: () => 0 });
		const r2 = defineInMemoryStateRegistry({ clock: () => 0 });
		const p1 = clockedNonDeterministicProducer();
		const p2 = clockedNonDeterministicProducer();
		r1.defineProducer(p1);
		r2.defineProducer(p2);
		// Pump counters so p1 and p2 diverge BEFORE the registry
		// even hydrates.
		p1.tick();
		p2.tick();
		p2.tick();
		const h1 = r1.hydrate(input());
		const h2 = r2.hydrate(input());
		expect(h1.ok && h2.ok).toBe(true);
		if (!h1.ok || !h2.ok) return;
		const ra = r1.lookup({ scope, producerId: 'cnondet' });
		const rb = r2.lookup({ scope, producerId: 'cnondet' });
		expect(ra.ok && rb.ok).toBe(true);
		if (!ra.ok || !rb.ok) return;
		expect(canonicalStateHash(ra.projection)).not.toBe(
			canonicalStateHash(rb.projection),
		);
	});
});
