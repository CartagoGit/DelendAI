#!/usr/bin/env bun
/**
 * idempotency.spec.ts — c00143 (Track N / q00006 §54).
 *
 * Pure-functional tests: synthetic clock, in-memory map, no I/O.
 * The file-persistence helpers are exercised through fakes for
 * `writeFile` / `readFile`.
 */

import { describe, expect, it } from 'vitest';

import {
	createIdempotencyStore,
	duplicateSuppressedRefusal,
	readIdempotencyFile,
	writeIdempotencyFile,
	type IIdempotencyStore,
} from '../../../../src/lib/mutations/idempotency';

describe('idempotency (c00143) — store semantics', () => {
	it('runs fn on first call and caches it', async () => {
		const now = 1_000;
		const store = createIdempotencyStore<string>({ now: () => now });
		let calls = 0;
		const a = await store.withIdempotency('k1', async () => {
			calls += 1;
			return 'first';
		});
		expect(a).toBe('first');
		expect(calls).toBe(1);
		expect(store.peek('k1')).toBe('first');
		expect(store.size()).toBe(1);
	});

	it('returns cached value on second call without running fn', async () => {
		const store = createIdempotencyStore<string>();
		let calls = 0;
		const fn = async (): Promise<string> => {
			calls += 1;
			return 'only-once';
		};
		const a = await store.withIdempotency('k1', fn);
		const b = await store.withIdempotency('k1', fn);
		expect(a).toBe('only-once');
		expect(b).toBe('only-once');
		expect(calls).toBe(1);
	});

	it('different keys execute independently', async () => {
		const store = createIdempotencyStore<number>();
		const calls: string[] = [];
		const a = await store.withIdempotency('k1', async () => {
			calls.push('k1');
			return 1;
		});
		const b = await store.withIdempotency('k2', async () => {
			calls.push('k2');
			return 2;
		});
		expect(calls).toEqual(['k1', 'k2']);
		expect(a).toBe(1);
		expect(b).toBe(2);
	});

	it('re-runs fn after TTL expires', async () => {
		let now = 1_000;
		const store = createIdempotencyStore<string>({
			ttlMs: 100,
			now: () => now,
		});
		let calls = 0;
		await store.withIdempotency('k1', async () => {
			calls += 1;
			return 'a';
		});
		expect(calls).toBe(1);
		now = 1_200; // past expiresAt = 1_100
		await store.withIdempotency('k1', async () => {
			calls += 1;
			return 'b';
		});
		expect(calls).toBe(2);
		expect(store.peek('k1')).toBe('b');
	});

	it('prune removes expired entries and counts them', async () => {
		let now = 1_000;
		const store = createIdempotencyStore<string>({
			ttlMs: 100,
			now: () => now,
		});
		// Seed two entries.
		await store.withIdempotency('k1', async () => 'a');
		await store.withIdempotency('k2', async () => 'b');
		now = 1_200;
		const removed = store.prune();
		expect(removed).toBe(2);
		expect(store.size()).toBe(0);
	});

	it('forget removes a single key', async () => {
		const store = createIdempotencyStore<string>();
		await store.withIdempotency('k1', async () => 'a');
		expect(store.forget('k1')).toBe(true);
		expect(store.forget('k1')).toBe(false);
		expect(store.peek('k1')).toBeUndefined();
	});

	it('clear wipes everything and resets the counter', async () => {
		const store = createIdempotencyStore<string>();
		await store.withIdempotency('k1', async () => 'a');
		await store.withIdempotency('k1', async () => 'a');
		const before = store.serialize().duplicateSuppressed;
		expect(before).toBe(1);
		store.clear();
		expect(store.size()).toBe(0);
		expect(store.serialize().duplicateSuppressed).toBe(0);
	});

	it('duplicateSuppressed counter increments on every cache hit', async () => {
		const store = createIdempotencyStore<string>();
		await store.withIdempotency('k1', async () => 'a');
		await store.withIdempotency('k1', async () => {
			throw new Error('should not run');
		});
		await store.withIdempotency('k1', async () => {
			throw new Error('should not run');
		});
		expect(store.serialize().duplicateSuppressed).toBe(2);
	});

	it('propagates fn errors and does NOT cache', async () => {
		const store = createIdempotencyStore<string>();
		await expect(
			store.withIdempotency('k1', async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(store.peek('k1')).toBeUndefined();
	});

	it('accepts synchronous fn results', () => {
		const store = createIdempotencyStore<number>();
		return store
			.withIdempotency('k1', () => 42)
			.then((v) => {
				expect(v).toBe(42);
			});
	});

	it('works with non-JSON-serialisable shapes when not persisted', async () => {
		const store = createIdempotencyStore<{ readonly n: number }>();
		const a = await store.withIdempotency('k1', async () => ({ n: 1 }));
		const b = await store.withIdempotency('k1', async () => {
			throw new Error('should not run');
		});
		expect(a.n).toBe(1);
		expect(b.n).toBe(1);
	});
});

describe('idempotency (c00143) — serialize / hydrate round-trip', () => {
	it('snapshot preserves every not-yet-expired record', async () => {
		const store = createIdempotencyStore<string>({ ttlMs: 10_000 });
		await store.withIdempotency('k1', async () => 'a');
		await store.withIdempotency('k2', async () => 'b');
		const snap = store.serialize();
		expect(snap.version).toBe(1);
		expect(snap.records).toHaveLength(2);
	});

	it('hydrate replaces the store contents', async () => {
		const src = createIdempotencyStore<string>({ ttlMs: 10_000 });
		await src.withIdempotency('k1', async () => 'a');
		const snap = src.serialize();

		const dst = createIdempotencyStore<string>({ ttlMs: 10_000 });
		await dst.withIdempotency(
			'unrelated',
			async () => 'gone-after-hydrate',
		);
		dst.hydrate(snap);
		expect(dst.peek('k1')).toBe('a');
		expect(dst.peek('unrelated')).toBeUndefined();
	});

	it('hydrate skips expired records silently', async () => {
		let now = 1_000;
		const src = createIdempotencyStore<string>({
			ttlMs: 100,
			now: () => now,
		});
		await src.withIdempotency('k1', async () => 'a');
		now = 1_500; // expired before hydration
		const dst = createIdempotencyStore<string>({
			ttlMs: 100,
			now: () => now,
		});
		dst.hydrate(src.serialize());
		expect(dst.peek('k1')).toBeUndefined();
	});

	it('hydrate rejects unknown versions without throwing', () => {
		const dst = createIdempotencyStore<string>();
		dst.hydrate({
			version: 2 as 1,
			records: [],
			duplicateSuppressed: 0,
		});
		expect(dst.size()).toBe(0);
	});

	it('hydrate keeps the larger of the two duplicateSuppressed counters', async () => {
		const a = createIdempotencyStore<string>();
		await a.withIdempotency('x', async () => 'v');
		await a.withIdempotency('x', async () => 'v');
		await a.withIdempotency('x', async () => 'v'); // 2 duplicates
		const b = createIdempotencyStore<string>();
		await b.withIdempotency('x', async () => 'v'); // 0 duplicates yet
		b.hydrate(a.serialize());
		expect(b.serialize().duplicateSuppressed).toBe(2);
	});
});

describe('idempotency (c00143) — file persistence', () => {
	it('writeIdempotencyFile writes a JSON snapshot', async () => {
		const store = createIdempotencyStore<string>();
		await store.withIdempotency('k1', async () => 'a');
		let writtenPath: string | undefined;
		let writtenContent = '';
		await writeIdempotencyFile(
			store,
			{ path: '/tmp/x.json' },
			async (path, content) => {
				writtenPath = path;
				writtenContent = content;
			},
		);
		expect(writtenPath).toBe('/tmp/x.json');
		const parsed = JSON.parse(writtenContent);
		expect(parsed.version).toBe(1);
		expect(parsed.records[0]?.key).toBe('k1');
	});

	it('readIdempotencyFile returns undefined when the file is missing', async () => {
		const snap = await readIdempotencyFile(
			{ path: '/nope.json' },
			async () => {
				throw new Error('ENOENT');
			},
		);
		expect(snap).toBeUndefined();
	});

	it('readIdempotencyFile returns undefined on garbage JSON', async () => {
		const snap = await readIdempotencyFile(
			{ path: '/x.json' },
			async () => 'this is not json',
		);
		expect(snap).toBeUndefined();
	});

	it('write → read → hydrate round-trip', async () => {
		const files = new Map<string, string>();
		const writeFile = async (
			path: string,
			content: string,
		): Promise<void> => {
			files.set(path, content);
		};
		const readFile = async (path: string): Promise<string> => {
			const v = files.get(path);
			if (v === undefined) throw new Error('ENOENT');
			return v;
		};
		const src: IIdempotencyStore<string> = createIdempotencyStore({
			ttlMs: 10_000,
		});
		await src.withIdempotency('k1', async () => 'a');
		await writeIdempotencyFile(src, { path: '/cache.json' }, writeFile);
		const snap = await readIdempotencyFile(
			{ path: '/cache.json' },
			readFile,
		);
		expect(snap).not.toBeUndefined();
		const dst: IIdempotencyStore<string> = createIdempotencyStore({
			ttlMs: 10_000,
		});
		// The helper is generic; the caller knows the shape.
		dst.hydrate(snap as unknown as Parameters<typeof dst.hydrate>[0]);
		expect(dst.peek('k1')).toBe('a');
	});
});

describe('idempotency (c00143) — refusal helper', () => {
	it('mints a stable IDEMPOTENT-DUPLICATE Refusal', () => {
		const r = duplicateSuppressedRefusal('commit-abc');
		expect(r.code).toBe('IDEMPOTENT-DUPLICATE');
		expect(r.message).toContain('commit-abc');
	});
});
