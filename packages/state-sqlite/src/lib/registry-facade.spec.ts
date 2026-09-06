import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { InMemoryStateRegistry } from '@delendai/state/driver-in-memory';
import { STATE_ABI_VERSION } from '@delendai/state/fingerprint';
import type {
	IProjectionResult,
	IStateChange,
	IStateInputSnapshot,
	IStateProducer,
} from '@delendai/state/producer';
import type { IHydrateInput } from '@delendai/state/registry';
import type { StateScope } from '@delendai/state/scope';
import { asWorktreeId } from '@delendai/state/scope';

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
		rebuild(ctx): IProjectionResult {
			const raw = ctx.resolved[0]?.content ?? new Uint8Array();
			const parsed = new TextDecoder().decode(raw);
			const value = parsed.length === 0 ? 0 : Number(parsed);
			return { canonical: { value } };
		},
		reconcile(ctx, change: IStateChange): IProjectionResult {
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
							digest: '' as never,
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
						digest: '' as never,
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
	});

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
});
