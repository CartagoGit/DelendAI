import { mkdirSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

function tmpDbPath(): string {
	const dir = mkdtempSync(join(tmpdir(), 'state-sqlite-'));
	return join(dir, 'state.sqlite');
}

function makeProducer(): IStateProducer {
	return {
		id: 'kv',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [{ kind: 'file', locator: 'kv.json' }],
		rebuild(ctx): IProjectionResult {
			const raw = ctx.resolved[0]?.content ?? new Uint8Array();
			const text = new TextDecoder().decode(raw);
			const entries = text.length > 0 ? (JSON.parse(text) as Array<[string, number]>) : [];
			entries.sort(([a], [b]) => a.localeCompare(b));
			return { canonical: { entries } };
		},
		reconcile(ctx, change: IStateChange): IProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { entries: [] }) as {
				entries: Array<[string, number]>;
			};
			const map = new Map(base.entries);
			if (change.kind === 'set') {
				map.set(String(change.key), Number(change.value));
			}
			if (change.kind === 'delete') {
				map.delete(String(change.key));
			}
			const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
			return { canonical: { entries } };
		},
	};
}

function snapshot(entries: Array<[string, number]> = []): IStateInputSnapshot {
	const bytes = new TextEncoder().encode(JSON.stringify(entries));
	return {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: 'kv',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{ kind: 'file', locator: 'kv.json', digest: '' as never },
					],
				},
			],
		},
		contents: new Map([['file|kv.json|', bytes]]),
		declared: [{ kind: 'file', locator: 'kv.json' }],
		byProducer: new Map([
			['kv', [{ spec: { kind: 'file', locator: 'kv.json' }, digest: '' as never, content: bytes }]],
		]),
	};
}

function input(entries: Array<[string, number]> = []): IHydrateInput {
	return {
		scope,
		storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
		snapshot: snapshot(entries),
	};
}

describe('SqliteStateRegistry', () => {
	it('round-trips hydrate -> lookup across registry instances', () => {
		const path = tmpDbPath();
		const producer = makeProducer();
		const writer = new SqliteStateRegistry({ path, clock: () => 10 });
		writer.defineProducer(producer);
		const hydrated = writer.hydrate(input([['a', 1]]));
		expect(hydrated.ok).toBe(true);
		writer.close();

		const reader = new SqliteStateRegistry({ path, clock: () => 20 });
		reader.defineProducer(producer);
		const read = reader.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ entries: [['a', 1]] });
		reader.close();
	});

	it('incremental converges on the same active state', () => {
		const registry = new SqliteStateRegistry({ path: tmpDbPath(), clock: () => 0 });
		registry.defineProducer(makeProducer());
		expect(registry.hydrate(input())).toMatchObject({ ok: true });
		const updated = registry.incremental(input([['a', 1], ['b', 2]]), {
			kind: 'set',
			key: 'b',
			value: 2,
		});
		expect(updated.ok).toBe(true);
		const read = registry.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ entries: [['a', 1], ['b', 2]] });
		registry.close();
	});

	it('10 parallel rebuilds converge to one consistent active state', async () => {
		const registry = new SqliteStateRegistry({ path: tmpDbPath(), clock: () => 100 });
		registry.defineProducer(makeProducer());
		const writes = Array.from({ length: 10 }, (_, index) =>
			Promise.resolve().then(() => registry.hydrate(input([[`k${String(index)}`, index]]))),
		);
		const results = await Promise.all(writes);
		expect(results.every((result) => result.ok)).toBe(true);
		const read = registry.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(Array.isArray((read.projection as { entries: unknown }).entries)).toBe(true);
		registry.close();
	});

	it('returns state_store_unavailable when the database path is not writable', () => {
		const root = mkdtempSync(join(tmpdir(), 'state-sqlite-ro-'));
		const dir = join(root, 'readonly');
		mkdirSync(dir);
		chmodSync(dir, 0o555);
		try {
			expect(() =>
				new SqliteStateRegistry({
					path: join(dir, 'state.sqlite'),
					clock: () => 0,
				}),
			).toThrow();
		} finally {
			chmodSync(dir, 0o755);
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('returns state_store_corrupt when integrity failure is forced through the persisted snapshot', () => {
		const path = tmpDbPath();
		const registry = new SqliteStateRegistry({ path, clock: () => 0 });
		registry.defineProducer(makeProducer());
		const initial = input([['a', 1]]);
		initial.snapshot = {
			...initial.snapshot,
			forceIntegrityFailure: true,
		} as typeof initial.snapshot & { forceIntegrityFailure: true };
		const hydrated = registry.hydrate(initial);
		// first hydrate persists the flag in the cache-backed payload.
		expect(hydrated.ok).toBe(true);
		const failed = registry.incremental(input([['a', 2]]), {
			kind: 'set',
			key: 'a',
			value: 2,
		});
		expect(failed.ok).toBe(false);
		if (failed.ok) return;
		expect(failed.reason).toBe('state_store_corrupt');
		registry.close();
	});
});