import { describe, expect, it } from 'vitest';

import { createInMemoryHandleStore } from '@delendai/core/public';

describe('artifact handle — v00133 S2', () => {
	it('opens a handle with an opaque viewer token and round-trips the value', () => {
		const store = createInMemoryHandleStore<{
			readonly items: readonly string[];
		}>();
		const handle = store.open(
			{ items: ['a', 'b', 'c'] },
			{ label: 'demo' },
		);

		expect(handle.handleId.startsWith('h:')).toBe(true);
		expect(handle.viewerToken.length).toBe(32);
		expect(handle.label).toBe('demo');

		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('ok');
		if (read.status === 'ok') {
			expect(read.value).toEqual({ items: ['a', 'b', 'c'] });
		}
		expect(store.size()).toBe(1);
	});

	it('rejects unknown handles', () => {
		const store = createInMemoryHandleStore<unknown>();
		const read = store.get('h:does-not-exist', 'wrong');
		expect(read.status).toBe('not-found');
	});

	it('rejects mismatched viewer tokens', () => {
		const store = createInMemoryHandleStore<{ readonly v: number }>();
		const handle = store.open({ v: 1 });
		const read = store.get(handle.handleId, 'not-the-token');
		expect(read.status).toBe('unauthorized');
	});

	it('expires a handle and reports expired', () => {
		const store = createInMemoryHandleStore<{ readonly v: number }>();
		const handle = store.open({ v: 1 });
		expect(store.expire(handle.handleId)).toBe(true);
		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('not-found');
		expect(store.size()).toBe(0);
	});

	it('redacts a handle so subsequent reads return a sentinel without leaking the value', () => {
		const store = createInMemoryHandleStore<{ readonly secret: string }>();
		const handle = store.open({ secret: 'super-private' });
		expect(store.redact(handle.handleId)).toBe(true);
		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('redacted');
		if (read.status === 'redacted') {
			expect(read.message).toContain('redacted');
			expect(
				(read as { readonly value?: unknown }).value,
			).toBeUndefined();
		}
	});

	it('enforces the maxBytes budget at open time', () => {
		const store = createInMemoryHandleStore<string>();
		expect(() => store.open('x'.repeat(2048), { maxBytes: 64 })).toThrow(
			/maxBytes/,
		);
		expect(store.size()).toBe(0);
	});

	it('expires entries on read when the supplied clock crosses the TTL deadline', () => {
		let now = 1_000;
		const clock = { now: () => now };
		const store = createInMemoryHandleStore<{ readonly v: number }>();
		const handle = store.open({ v: 42 }, { ttlMs: 100, clock });
		expect(handle.expiresAt).toBe(1100);
		now = 1101;
		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('expired');
		expect(store.size()).toBe(0);
	});

	it('keeps entries alive when the TTL has not been crossed', () => {
		let now = 1_000;
		const clock = { now: () => now };
		const store = createInMemoryHandleStore<{ readonly v: number }>();
		const handle = store.open({ v: 7 }, { ttlMs: 100, clock });
		now = 1099;
		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('ok');
		if (read.status === 'ok') {
			expect(read.value).toEqual({ v: 7 });
		}
	});

	it('uses the default clock when ttlMs is provided without an explicit clock', () => {
		const store = createInMemoryHandleStore<{ readonly v: number }>();
		const handle = store.open({ v: 1 }, { ttlMs: 100 });
		expect(handle.expiresAt).not.toBeNull();
		const read = store.get(handle.handleId, handle.viewerToken);
		expect(read.status).toBe('ok');
	});
});
