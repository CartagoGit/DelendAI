/**
 * hash.spec.ts — q00018 S2 acceptance.
 *
 * Pins the canonical-hash semantics:
 *
 *   - key order is normalised (object keys sorted)
 *   - array order is preserved (the producer is responsible for
 *     sorting when order matters)
 *   - `generated_at`, `hydrated_at`, etc. are stripped before
 *     hashing
 *   - the same canonical payload always yields the same hash
 *   - reordering object keys does NOT change the hash
 */

import { describe, expect, it } from 'vitest';

import {
	canonicalStateHash,
	withoutLocalMetadata,
	LOCAL_METADATA_KEYS,
} from '../../src/lib/hash';

describe('canonicalStateHash (q00018 S2)', () => {
	it('produces a stable 64-char lowercase hex digest', () => {
		const hash = canonicalStateHash({ a: 1, b: [1, 2, 3] });
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is insensitive to object key order', () => {
		const a = canonicalStateHash({ a: 1, b: 2, c: 3 });
		const b = canonicalStateHash({ c: 3, a: 1, b: 2 });
		const c = canonicalStateHash({ b: 2, c: 3, a: 1 });
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('preserves array order (semantic)', () => {
		const a = canonicalStateHash({ items: [1, 2, 3] });
		const b = canonicalStateHash({ items: [3, 2, 1] });
		expect(a).not.toBe(b);
	});

	it('strips local metadata fields by default', () => {
		const withMeta = canonicalStateHash({
			proposals: [{ id: 'p1' }],
			generated_at: '2026-09-05T11:00:00Z',
			hydrated_at: '2026-09-05T11:00:00Z',
			pid: 12345,
			hostname: 'agent-host',
		});
		const withoutMeta = canonicalStateHash({
			proposals: [{ id: 'p1' }],
		});
		expect(withMeta).toBe(withoutMeta);
	});

	it('strips extra skip keys when the producer asks for them', () => {
		const withReq = canonicalStateHash(
			{ proposals: [], requestId: 'req-abc' },
			['requestId'],
		);
		const plain = canonicalStateHash({ proposals: [] });
		expect(withReq).toBe(plain);
	});

	it('withoutLocalMetadata keeps nested structure intact', () => {
		const purged = withoutLocalMetadata({
			level1: {
				level2: {
					value: 42,
					generated_at: 'should-go',
				},
				list: [
					{ id: 'a', created_at: 1 },
					{ id: 'b', created_at: 2 },
				],
			},
		});
		expect(purged).toEqual({
			level1: {
				level2: { value: 42 },
				list: [{ id: 'a' }, { id: 'b' }],
			},
		});
	});

	it('LOCAL_METADATA_KEYS is the documented baseline set', () => {
		expect(LOCAL_METADATA_KEYS).toContain('generated_at');
		expect(LOCAL_METADATA_KEYS).toContain('hydrated_at');
		expect(LOCAL_METADATA_KEYS).toContain('pid');
		expect(LOCAL_METADATA_KEYS).toContain('hostname');
	});

	it('hashes nested objects with mixed types', () => {
		const payload = {
			proposals: [
				{ id: 'p1', status: 'ready', deps: ['a', 'b'] },
				{ id: 'p2', status: 'done', deps: [] },
			],
			summary: { total: 2, ready: 1, done: 1 },
			tags: ['state-engine', 'phase-0'],
		};
		const h1 = canonicalStateHash(payload);
		const h2 = canonicalStateHash({
			tags: ['state-engine', 'phase-0'],
			summary: { ready: 1, total: 2, done: 1 },
			proposals: [
				{ deps: ['a', 'b'], id: 'p1', status: 'ready' },
				{ deps: [], id: 'p2', status: 'done' },
			],
		});
		expect(h1).toBe(h2);
	});
});
