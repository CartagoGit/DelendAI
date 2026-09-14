/**
 * hash.spec.ts — q00018 Phase 0.1 S6.
 *
 * Pins the SHA-256 implementation against the FIPS 180-4 standard
 * test vectors. If this test fails, the canonical hash has
 * drifted from industry-standard SHA-256 and any persisted hash
 * would be incompatible across an ABI bump.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalJsonValue } from '@delendai/contracts/state';

import {
	canonicalStateHash,
	canonicalStringify,
	sha256BytesHex,
	sha256Hex,
	SHA256_STANDARD_VECTORS,
	withoutLocalMetadata,
	LOCAL_METADATA_KEYS,
} from '../../src/lib/hash';

/**
 * A projection as a producer hands it over.
 *
 * `CanonicalJsonValue` has no room for `undefined` on purpose — the
 * stripping below is what turns a real projection into one. The single
 * assertion that says so lives here rather than at every call site.
 */
const asProjection = (value: unknown): CanonicalJsonValue =>
	value as CanonicalJsonValue;

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

describe('canonicalStringify — the shapes a projection actually arrives in', () => {
	it('drops an undefined value instead of serialising the key', () => {
		expect(
			canonicalStringify(asProjection({ a: 1, b: undefined, c: 2 })),
		).toBe('{"a":1,"c":2}');
	});

	it('turns an undefined ARRAY element into null, because position is meaning', () => {
		// Dropping it would shift every later element by one and change
		// what the hash is about.
		expect(canonicalStringify(asProjection([1, undefined, 3]))).toBe(
			'[1,null,3]',
		);
	});

	it('keeps null, which is a value, apart from undefined, which is an absence', () => {
		expect(canonicalStringify(asProjection({ a: null }))).toBe(
			'{"a":null}',
		);
		expect(canonicalStateHash({ a: null })).not.toBe(
			canonicalStateHash(asProjection({ a: undefined })),
		);
	});

	it('serialises a primitive at the root', () => {
		expect(canonicalStringify('x')).toBe('"x"');
		expect(canonicalStringify(7)).toBe('7');
		expect(canonicalStringify(true)).toBe('true');
		expect(canonicalStringify(null)).toBe('null');
	});

	it('sorts keys at every depth, not only the top one', () => {
		expect(
			canonicalStringify(asProjection({ b: { d: 1, c: 2 }, a: 3 })),
		).toBe('{"a":3,"b":{"c":2,"d":1}}');
	});

	it('recurses into objects nested inside arrays', () => {
		expect(
			canonicalStringify(
				asProjection([{ b: 1, a: 2 }, [{ d: 3, c: 4 }]]),
			),
		).toBe('[{"a":2,"b":1},[{"c":4,"d":3}]]');
	});
});

describe('withoutLocalMetadata — the recursion, not just the top level', () => {
	it('strips a skipped key from inside an array of objects', () => {
		expect(
			withoutLocalMetadata(
				asProjection([
					{ id: 'a', pid: 1 },
					{ id: 'b', hostname: 'h' },
				]),
			),
		).toEqual([{ id: 'a' }, { id: 'b' }]);
	});

	it('leaves a null and a primitive alone', () => {
		expect(withoutLocalMetadata(null)).toBe(null);
		expect(withoutLocalMetadata(asProjection('pid'))).toBe('pid');
		expect(withoutLocalMetadata(asProjection([1, null, 'x']))).toEqual([
			1,
			null,
			'x',
		]);
	});

	it('strips a key whose value is itself an object', () => {
		expect(
			withoutLocalMetadata(
				asProjection({
					keep: { inner: 1 },
					created_at: { was: 'an object' },
				}),
			),
		).toEqual({ keep: { inner: 1 } });
	});
});

describe('sha256BytesHex — bytes, not text', () => {
	it('hashes an empty byte sequence to the empty-string vector', () => {
		expect(sha256BytesHex(new Uint8Array())).toBe(sha256Hex(''));
	});

	it('agrees with the text path for ASCII', () => {
		expect(sha256BytesHex(new TextEncoder().encode('abc'))).toBe(
			sha256Hex('abc'),
		);
	});

	it('does NOT agree with the text path for invalid UTF-8, which is the point', () => {
		// A lone 0xff is not decodable; hashing it as text would
		// substitute a replacement character and let two hosts that
		// disagree on the content produce the same digest.
		const invalid = new Uint8Array([0xff]);
		expect(sha256BytesHex(invalid)).not.toBe(sha256Hex('\uFFFD'));
	});
});

describe('the UTF-8 encoder', () => {
	it('encodes every code-point width the same way TextEncoder does', () => {
		// One byte, two, three, and a surrogate pair — the four branches
		// the hand-written fallback has to get right for a host without
		// TextEncoder. Compared against the built-in rather than against
		// a literal, so the assertion states the property.
		for (const text of ['a', 'ß', '→', '😀', 'aß→😀']) {
			expect(sha256Hex(text)).toBe(
				sha256BytesHex(new TextEncoder().encode(text)),
			);
		}
	});

	it('hashes a lone high surrogate without hanging or throwing', () => {
		expect(sha256Hex('\uD800')).toMatch(/^[0-9a-f]{64}$/u);
	});

	describe('on a host with no TextEncoder', () => {
		// The fallback exists so the State Engine can run anywhere, and
		// until now nothing had ever executed it: a host without
		// TextEncoder would have been the first to find out whether it
		// was correct. The built-in is captured before it is removed so
		// the expectation still comes from the reference implementation.
		const encode = (text: string): Uint8Array =>
			new TextEncoder().encode(text);

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('produces the same digest as the built-in for every width', () => {
			const expected = ['a', 'ß', '→', '😀', 'aß→😀', ''].map((text) => [
				text,
				sha256BytesHex(encode(text)),
			]);

			vi.stubGlobal('TextEncoder', undefined);

			for (const [text, digest] of expected) {
				expect(sha256Hex(text as string)).toBe(digest);
			}
		});

		it('keeps a lone surrogate from being read as a pair', () => {
			const lone = '\uD800a';
			const expected = sha256BytesHex(encode(lone));

			vi.stubGlobal('TextEncoder', undefined);

			expect(sha256Hex(lone)).toBe(expected);
		});
	});
});
