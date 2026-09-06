/**
 * hash.spec.ts — q00018 Phase 0.1 S6.
 *
 * Pins the SHA-256 implementation against the FIPS 180-4 standard
 * test vectors. If this test fails, the canonical hash has
 * drifted from industry-standard SHA-256 and any persisted hash
 * would be incompatible across an ABI bump.
 */

import { describe, expect, it } from 'vitest';

import {
	canonicalStateHash,
	sha256Hex,
	SHA256_STANDARD_VECTORS,
	withoutLocalMetadata,
	LOCAL_METADATA_KEYS,
} from '../../src/lib/hash';

describe('SHA-256 standard vectors (q00018 S6)', () => {
	for (const vector of SHA256_STANDARD_VECTORS) {
		const label =
			vector.input.length === 0 ? 'empty string' : `"${vector.input}"`;
		it(`sha256(${label})`, () => {
			expect(sha256Hex(vector.input)).toBe(vector.hex);
		});
	}

	it('sha256("") is the empty-string FIPS vector', () => {
		expect(sha256Hex('')).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		);
	});

	it('sha256("abc") is the canonical FIPS vector', () => {
		expect(sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		);
	});
});

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
		const withoutMeta = canonicalStateHash({ proposals: [{ id: 'p1' }] });
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
				level2: { value: 42, generated_at: 'should-go' },
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
			tags: ['state-engine', 'phase-0.1'],
		};
		const h1 = canonicalStateHash(payload);
		const h2 = canonicalStateHash({
			tags: ['state-engine', 'phase-0.1'],
			summary: { ready: 1, total: 2, done: 1 },
			proposals: [
				{ deps: ['a', 'b'], id: 'p1', status: 'ready' },
				{ deps: [], id: 'p2', status: 'done' },
			],
		});
		expect(h1).toBe(h2);
	});
});
