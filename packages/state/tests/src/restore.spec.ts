/**
 * restore.spec.ts — a durable driver re-publishes stored projections.
 *
 * `hydrate` recomputes projections from inputs. After a restart that is
 * the wrong source: an `incremental` over unchanged inputs carries state
 * no rebuild can recover. `restore` publishes what was stored, validated
 * the same way a build is, and refuses anything it cannot vouch for.
 */

import { describe, expect, it } from 'vitest';

import { InMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import type {
	IStateInputSnapshot,
	IStateProducer,
} from '../../src/lib/producer';
import type { IHydrateInput } from '../../src/lib/registry';
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

const counter = (overrides: Partial<IStateProducer> = {}): IStateProducer => ({
	id: 'counter',
	abiVersion: STATE_ABI_VERSION,
	producerVersion: 1,
	serves: ['project'],
	inputs: [],
	rebuild: () => ({ canonical: { count: 0 } }),
	reconcile: (ctx, change) => ({
		canonical: {
			count:
				((
					ctx.baseProjection?.canonical as
						| { count: number }
						| undefined
				)?.count ?? 0) +
				(typeof change.delta === 'number' ? change.delta : 1),
		},
	}),
	...overrides,
});

const input = (producer: IStateProducer): IHydrateInput => {
	const snapshot: IStateInputSnapshot = {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: producer.id,
					producerVersion: producer.producerVersion,
					abiVersion: producer.abiVersion,
					inputs: [],
				},
			],
		},
		contents: new Map(),
		declared: [],
		byProducer: new Map([[producer.id, []]]),
	};
	return {
		scope,
		storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
		snapshot,
	};
};

describe('InMemoryStateRegistry.restore', () => {
	it('re-publishes a stored projection that no rebuild could produce', () => {
		const producer = counter();
		const original = new InMemoryStateRegistry({ clock: () => 0 });
		original.defineProducer(producer);
		expect(original.hydrate(input(producer)).ok).toBe(true);
		const built = original.incremental(input(producer), {
			kind: 'tick',
			delta: 3,
		});
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		const stored = original.lookup({ scope, producerId: 'counter' });
		expect(stored).toMatchObject({ ok: true, projection: { count: 3 } });
		if (!stored.ok) return;

		const reopened = new InMemoryStateRegistry({ clock: () => 1 });
		reopened.defineProducer(producer);
		const restored = reopened.restore(
			input(producer),
			new Map([['counter', stored.projection]]),
		);

		expect(restored.ok).toBe(true);
		if (!restored.ok) return;
		expect(restored.generation.canonicalHash).toBe(
			built.generation.canonicalHash,
		);
		expect(reopened.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: true,
				projection: { count: 3 },
			},
		);
		expect(
			reopened.incremental(input(producer), { kind: 'tick', delta: 1 }),
		).toMatchObject({ ok: true });
		expect(reopened.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				projection: { count: 4 },
			},
		);
	});

	it('refuses a store that lacks a projection for a serving producer', () => {
		const producer = counter();
		const registry = new InMemoryStateRegistry({ clock: () => 0 });
		registry.defineProducer(producer);
		const result = registry.restore(input(producer), new Map());

		expect(result).toMatchObject({
			ok: false,
			reason: 'projection_invalid',
		});
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: false,
				reason: 'no_active_generation',
			},
		);
	});

	it('refuses a stored projection the producer does not accept', () => {
		const producer = counter({
			validateProjection: (canonical) => ({
				issues:
					typeof (canonical as { count?: unknown }).count === 'number'
						? []
						: [{ path: 'count', message: 'must be a number' }],
			}),
		});
		const registry = new InMemoryStateRegistry({ clock: () => 0 });
		registry.defineProducer(producer);
		const result = registry.restore(
			input(producer),
			new Map([['counter', { count: 'three' }]]),
		);

		expect(result).toMatchObject({
			ok: false,
			reason: 'projection_invalid',
			detail: 'counter: count: must be a number',
		});
	});
});
