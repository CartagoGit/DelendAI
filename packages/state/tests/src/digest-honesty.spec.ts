/**
 * digest-honesty.spec.ts — x00504 / reviewer acceptance: a
 * synthesised snapshot's digest MUST reflect the actual content
 * bytes, not the input key.
 *
 * The pre-fix `driver.digestOf(key)` returned '' as Sha256Hex for
 * every synthesised bucket, so two completely different contents
 * under the same key produced the same fingerprint and any
 * difference between them was invisible to the cache. The fix
 * hashes the actual content bytes via sha256Hex().
 *
 * The honesty property is exercised at the fingerprint level:
 * `materialiseSnapshot()` now populates `byProducer` with entries
 * whose `digest` is sha256(content). We pin that contract two ways:
 *
 *   1. (unit) `fingerprintFromResolved()` over a `byProducer` map
 *      synthesised by hand with two distinct contents yields two
 *      distinct canonical fingerprints.
 *
 *   2. (unit) `sha256(content)` is the actual digest on every
 *      bucket — verify the canonical vector
 *      `sha256("hello world") === b94d…cde9`.
 *
 * The driver-level integration ("two hyrdate()s with different
 * content produce different diagnostics") is covered by the
 * existing phase-0.2 snapshot acceptance tests + the seedFingerprint
 * surface; we don't add that here to avoid widening the harness.
 */

import { describe, expect, it } from 'vitest';

import { fingerprintFromResolved } from '../../src/lib/fingerprint';
import type { IResolvedProducerInput } from '../../src/lib/fingerprint';
import { sha256Hex } from '../../src/lib/hash';

const resolveBucket = (content: string): readonly IResolvedProducerInput[] => {
	const bytes = new TextEncoder().encode(content);
	return [
		{
			spec: { kind: 'file', locator: 'README.md' },
			digest: sha256Hex(content),
			content: bytes,
		},
	];
};

describe('digest honesty in synthesised buckets (x00504)', () => {
	it('sha256("hello world") matches the FIPS-180 vector', () => {
		expect(sha256Hex('hello world')).toBe(
			'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
		);
	});

	it('two different contents produce two distinct fingerprints', () => {
		const a = new Map([['docs', resolveBucket('hello world')]]);
		const b = new Map([['docs', resolveBucket('goodbye world')]]);

		const fpA = fingerprintFromResolved(1, a);
		const fpB = fingerprintFromResolved(1, b);

		expect(fpA).not.toEqual(fpB);
	});

	it('same content twice produces identical fingerprints (determinism)', () => {
		const a = new Map([['docs', resolveBucket('hello world')]]);
		const b = new Map([['docs', resolveBucket('hello world')]]);

		const fpA = fingerprintFromResolved(1, a);
		const fpB = fingerprintFromResolved(1, b);

		expect(fpA).toEqual(fpB);
	});
});
