import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	InMemoryStateRegistry,
	STATE_ABI_VERSION,
	asWorktreeId,
	sha256BytesHex,
	type IHydrateInput,
	type IProjectionResult,
	type IStateChange,
	type IStateGeneration,
	type IStateInputSnapshot,
	type IStateProducer,
	type IProducerContext,
	type StateScope,
} from '@delendai/state';

import { createRegistryFacade } from './registry-facade';
import { SqliteStateRegistry } from './sqlite-driver';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

function dbPath(name: string): string {
	return join(
		mkdtempSync(join(tmpdir(), `state-facade-${name}-`)),
		'state.sqlite',
	);
}

function producer(): IStateProducer {
	return {
		id: 'counter',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [{ kind: 'file', locator: 'counter.json' }],
		rebuild(ctx: IProducerContext): IProjectionResult {
			const raw = ctx.resolved[0]?.content ?? new Uint8Array();
			const parsed = new TextDecoder().decode(raw);
			const value = parsed.length === 0 ? 0 : Number(parsed);
			return { canonical: { value } };
		},
		reconcile(
			ctx: IProducerContext,
			change: IStateChange,
		): IProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { value: 0 }) as {
				value: number;
			};
			if (change.kind === 'tick') {
				return {
					canonical: {
						value: base.value + Number(change.delta ?? 1),
					},
				};
			}
			return { canonical: base };
		},
	};
}

function hydrateInput(value: number): IHydrateInput {
	const bytes = new TextEncoder().encode(String(value));
	const digest = sha256BytesHex(bytes);
	const snapshot: IStateInputSnapshot = {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: 'counter',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'file',
							locator: 'counter.json',
							digest,
						},
					],
				},
			],
		},
		contents: new Map([['file|counter.json|', bytes]]),
		declared: [{ kind: 'file', locator: 'counter.json' }],
		byProducer: new Map([
			[
				'counter',
				[
					{
						spec: { kind: 'file', locator: 'counter.json' },
						digest,
						content: bytes,
					},
				],
			],
		]),
	};
	return {
		scope,
		storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
		snapshot,
	};
}

describe('createRegistryFacade', () => {
	it('keeps in-memory and sqlite in parity over 1000 operations', () => {
		const p = producer();
		const facade = createRegistryFacade({
			primary: new InMemoryStateRegistry({ clock: () => 0 }),
			shadow: new SqliteStateRegistry({
				path: dbPath('parity'),
				clock: () => 0,
			}),
			samplerIntervalMs: 60_000,
			sampleFactory: {
				primary: () => new InMemoryStateRegistry({ clock: () => 0 }),
				shadow: () =>
					new SqliteStateRegistry({
						path: dbPath('sample'),
						clock: () => 0,
					}),
			},
		});
		facade.defineProducer(p);
		facade.hydrate(hydrateInput(0));
		for (let index = 1; index <= 1000; index += 1) {
			facade.incremental(hydrateInput(index), { kind: 'tick', delta: 1 });
		}
		const read = facade.lookup({ scope, producerId: 'counter' });
		expect(read.ok).toBe(true);
		expect(facade.mismatches).toEqual([]);
		facade.stopSampler();
	}, 180000);

	it('sampler reports a forced divergence', () => {
		const p = producer();
		const incidents: Array<{
			readonly incidentType: 'state-parity-mismatch';
		}> = [];
		const primary = new InMemoryStateRegistry({ clock: () => 0 });
		const shadow = new SqliteStateRegistry({
			path: dbPath('diverge'),
			clock: () => 0,
		});
		const facade = createRegistryFacade({
			primary,
			shadow,
			logger: (incident) => {
				incidents.push({ incidentType: incident.incidentType });
			},
			samplerIntervalMs: 60_000,
		});
		facade.defineProducer(p);
		facade.hydrate(hydrateInput(1));
		shadow.incremental(hydrateInput(3), { kind: 'tick', delta: 2 });
		facade.sampleNow();
		expect(incidents).toHaveLength(1);
		facade.stopSampler();
	});

	it('still catches a divergence produced by the write itself', () => {
		// The per-write parity check compares the two generations the
		// operation produced instead of re-hashing both whole registries
		// (which was O(n) per write, so O(n²) per run). This proves the
		// cheaper check still fails when the two sides disagree — the
		// property the expensive version existed for.
		const incidents: Array<{ readonly incidentType: string }> = [];
		const primary = new InMemoryStateRegistry({ clock: () => 0 });
		const shadow = new SqliteStateRegistry({
			path: dbPath('write-diverge'),
			clock: () => 0,
		});
		const facade = createRegistryFacade({
			primary,
			shadow,
			logger: (incident) => {
				incidents.push({ incidentType: incident.incidentType });
			},
			samplerIntervalMs: 600_000,
		});
		facade.defineProducer(producer());
		facade.hydrate(hydrateInput(0));

		// Move the shadow on its own so the next shared write produces a
		// generation whose canonical hash cannot match the primary's.
		shadow.incremental(hydrateInput(99), { kind: 'tick', delta: 7 });
		const before = facade.mismatches.length;
		facade.incremental(hydrateInput(1), { kind: 'tick', delta: 1 });

		expect(facade.mismatches.length).toBeGreaterThan(before);
		expect(incidents.at(-1)?.incidentType).toBe('state-parity-mismatch');
		facade.stopSampler();
	});

	it('does not re-hash whole registries on a write that produced generations', () => {
		// The regression guard for the perf fix: a reverted `compare`
		// would call `diagnose()` on both registries for every write,
		// which is exactly what made the 1000-operation parity test
		// exceed its 180s CI timeout.
		let primaryDiagnoseCalls = 0;
		const counted = new InMemoryStateRegistry({ clock: () => 0 });
		// Count `diagnose()` calls by overriding the single method under
		// test rather than proxying the whole registry: a `Proxy` `get`
		// trap has to hand back `Reflect.get`'s `any`, which is exactly
		// the unsafe-cast shape `lint:test-unsafe-casts` forbids.
		const realDiagnose = counted.diagnose.bind(counted);
		counted.diagnose = (): readonly IStateGeneration[] => {
			primaryDiagnoseCalls += 1;
			return realDiagnose();
		};
		const facade = createRegistryFacade({
			primary: counted,
			shadow: new SqliteStateRegistry({
				path: dbPath('no-rehash'),
				clock: () => 0,
			}),
			samplerIntervalMs: 600_000,
		});
		facade.defineProducer(producer());
		facade.hydrate(hydrateInput(0));
		const afterHydrate = primaryDiagnoseCalls;

		for (let index = 1; index <= 5; index += 1) {
			facade.incremental(hydrateInput(index), {
				kind: 'tick',
				delta: 1,
			});
		}

		expect(primaryDiagnoseCalls).toBe(afterHydrate);
		facade.stopSampler();
	});
});
