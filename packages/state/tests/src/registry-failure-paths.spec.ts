/**
 * registry-failure-paths.spec.ts — how hydrate, incremental and restore
 * refuse.
 *
 * The three build paths share one snapshot check and one projection
 * check. These cases pin that they refuse the same way, and that the
 * scope filter keeps a producer out of scopes it does not serve.
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

const producer = (overrides: Partial<IStateProducer> = {}): IStateProducer => ({
	id: 'counter',
	abiVersion: STATE_ABI_VERSION,
	producerVersion: 1,
	serves: ['project'],
	inputs: [],
	rebuild: () => ({ canonical: { count: 0 } }),
	reconcile: (ctx) => ({
		canonical: {
			count:
				((
					ctx.baseProjection?.canonical as
						| { count: number }
						| undefined
				)?.count ?? 0) + 1,
		},
	}),
	...overrides,
});

const input = (
	producers: readonly IStateProducer[],
	fingerprintIds: readonly string[] = producers.map((p) => p.id),
): IHydrateInput => {
	const snapshot: IStateInputSnapshot = {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: fingerprintIds.map((id) => ({
				id,
				producerVersion: 1,
				abiVersion: STATE_ABI_VERSION,
				inputs: [],
			})),
		},
		contents: new Map(),
		declared: [],
		byProducer: new Map(fingerprintIds.map((id) => [id, []])),
	};
	return {
		scope,
		storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
		snapshot,
	};
};

const registryWith = (
	...producers: readonly IStateProducer[]
): InMemoryStateRegistry => {
	const registry = new InMemoryStateRegistry({ clock: () => 0 });
	for (const p of producers) registry.defineProducer(p);
	return registry;
};

describe('build paths skip producers that do not serve the scope', () => {
	const swarmOnly = producer({ id: 'swarm-only', serves: ['swarm'] });

	it('hydrate, incremental and restore publish only serving producers', () => {
		const counter = producer();
		const registry = registryWith(counter, swarmOnly);
		const served = input([counter]);

		expect(registry.hydrate(served).ok).toBe(true);
		expect(registry.incremental(served, { kind: 'tick' }).ok).toBe(true);
		expect(
			registry.restore(served, new Map([['counter', { count: 7 }]])).ok,
		).toBe(true);
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: true,
				projection: { count: 7 },
			},
		);
		expect(
			registry.lookup({ scope, producerId: 'swarm-only' }),
		).toMatchObject({ ok: false, reason: 'producer_not_found' });
	});
});

describe('a producer that throws is reported, not propagated', () => {
	it('reports an Error thrown by rebuild with its message', () => {
		const failing = producer({
			rebuild: () => {
				throw new Error('rebuild exploded');
			},
		});
		expect(registryWith(failing).hydrate(input([failing]))).toMatchObject({
			ok: false,
			reason: 'producer_threw',
			detail: 'rebuild exploded',
		});
	});

	it('reports a non-Error thrown by rebuild as text', () => {
		const failing = producer({
			rebuild: () => {
				throw 'plain text';
			},
		});
		expect(registryWith(failing).hydrate(input([failing]))).toMatchObject({
			ok: false,
			reason: 'producer_threw',
			detail: 'plain text',
		});
	});

	it('reports both kinds of throw from reconcile', () => {
		const withError = producer({
			reconcile: () => {
				throw new Error('reconcile exploded');
			},
		});
		const errorRegistry = registryWith(withError);
		expect(errorRegistry.hydrate(input([withError])).ok).toBe(true);
		expect(
			errorRegistry.incremental(input([withError]), { kind: 'tick' }),
		).toMatchObject({
			ok: false,
			reason: 'producer_threw',
			detail: 'reconcile exploded',
		});

		const withText = producer({
			reconcile: () => {
				throw 42;
			},
		});
		const textRegistry = registryWith(withText);
		expect(textRegistry.hydrate(input([withText])).ok).toBe(true);
		expect(
			textRegistry.incremental(input([withText]), { kind: 'tick' }),
		).toMatchObject({ ok: false, reason: 'producer_threw', detail: '42' });
	});
});

describe('projection validation applies to every build path', () => {
	const requireCount = (
		canonical: unknown,
	): { issues: { path: string; message: string }[] } => ({
		issues:
			typeof (canonical as { count?: unknown }).count === 'number'
				? []
				: [{ path: 'count', message: 'must be a number' }],
	});

	it('accepts a projection the producer validates', () => {
		const valid = producer({ validateProjection: requireCount });
		expect(registryWith(valid).hydrate(input([valid])).ok).toBe(true);
	});

	it('refuses an invalid rebuild', () => {
		const invalid = producer({
			rebuild: () => ({ canonical: { count: 'zero' } }),
			validateProjection: requireCount,
		});
		expect(registryWith(invalid).hydrate(input([invalid]))).toMatchObject({
			ok: false,
			reason: 'projection_invalid',
			detail: 'counter: count: must be a number',
		});
	});

	it('refuses an invalid reconcile and keeps the previous generation', () => {
		const invalid = producer({
			reconcile: () => ({ canonical: { count: 'many' } }),
			validateProjection: requireCount,
		});
		const registry = registryWith(invalid);
		expect(registry.hydrate(input([invalid])).ok).toBe(true);
		expect(
			registry.incremental(input([invalid]), { kind: 'tick' }),
		).toMatchObject({ ok: false, reason: 'projection_invalid' });
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: true,
				projection: { count: 0 },
			},
		);
	});
});

describe('an invalid snapshot is refused before any producer runs', () => {
	it('incremental refuses a fingerprint missing a producer the scope serves', () => {
		const counter = producer();
		const registry = registryWith(counter);
		expect(registry.hydrate(input([counter])).ok).toBe(true);

		expect(
			registry.incremental(input([counter], []), { kind: 'tick' }),
		).toMatchObject({
			ok: false,
			reason: 'snapshot_invalid',
			detail: 'fingerprint_mismatch(counter): registry expects this producer in the fingerprint but it is absent',
		});
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: true,
				projection: { count: 0 },
			},
		);
	});

	it('restore refuses content that no producer declared', () => {
		const counter = producer();
		const registry = registryWith(counter);
		const served = input([counter]);
		const stray: IHydrateInput = {
			...served,
			snapshot: {
				...served.snapshot,
				contents: new Map([['stray.json', new Uint8Array()]]),
			},
		};

		expect(
			registry.restore(stray, new Map([['counter', { count: 1 }]])),
		).toMatchObject({
			ok: false,
			reason: 'snapshot_invalid',
			detail: expect.stringContaining('orphan_contents[stray.json]'),
		});
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: false,
				reason: 'no_active_generation',
			},
		);
	});

	it('ignores producers outside the scope, because a snapshot is scope-local', () => {
		// x00504 S5: a host may pack producers for other scopes into one
		// snapshot; they are stripped before comparison, not reported.
		const counter = producer();
		const registry = registryWith(counter);
		expect(
			registry.hydrate(input([counter], ['counter', 'other-scope'])).ok,
		).toBe(true);
	});
});

describe('incremental without an active generation', () => {
	it('builds from inputs, as hydrate would', () => {
		const counter = producer();
		const registry = registryWith(counter);
		expect(
			registry.incremental(input([counter]), { kind: 'tick' }),
		).toMatchObject({ ok: true });
		expect(registry.lookup({ scope, producerId: 'counter' })).toMatchObject(
			{
				ok: true,
				projection: { count: 0 },
			},
		);
	});
});
