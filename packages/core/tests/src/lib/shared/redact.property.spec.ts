import { describe, expect, it } from 'vitest';

import { redactSecrets } from '@mcp-vertex/core/public';

/**
 * Property-based coverage for `redactSecrets` (M32). The existing coverage
 * (via `plugins/memory/tests/.../redact-ttl.spec.ts`) only exercises a
 * handful of hand-picked literals; these specs generate many shapes per
 * secret pattern so a regression in one of the regexes (an off-by-one in a
 * length bound, a missing word boundary, …) fails on at least one of many
 * generated cases instead of needing the exact same literal to be re-typed.
 *
 * Deterministic PRNG (mulberry32) — no new dependency, reproducible failures.
 */
const mulberry32 = (seed: number) => {
	let a = seed;
	return (): number => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const ALPHANUM =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const randomString = (rng: () => number, length: number): string => {
	let out = '';
	for (let i = 0; i < length; i++) {
		out += ALPHANUM[Math.floor(rng() * ALPHANUM.length)];
	}
	return out;
};

const PLAIN_WORDS = [
	'the',
	'proposal',
	'closes',
	'slice',
	'after',
	'validate',
	'green',
	'agent',
	'lock',
	'queue',
	'workspace',
	'release',
	'commit',
	'message',
	'document',
	'frontmatter',
];

const randomSentence = (rng: () => number, words: number): string =>
	Array.from(
		{ length: words },
		() => PLAIN_WORDS[Math.floor(rng() * PLAIN_WORDS.length)],
	).join(' ');

// One generator per high-confidence pattern in redact.ts, each producing a
// fresh random instance that should always be redacted.
const SECRET_GENERATORS: ReadonlyArray<{
	readonly name: string;
	readonly gen: (rng: () => number) => string;
}> = [
	{
		name: 'aws-access-key',
		gen: (rng) => `AKIA${randomString(rng, 16).toUpperCase()}`,
	},
	{
		name: 'github-token',
		gen: (rng) => `ghp_${randomString(rng, 36)}`,
	},
	{
		name: 'github-pat',
		gen: (rng) => `github_pat_${randomString(rng, 24)}`,
	},
	{
		name: 'google-api-key',
		gen: (rng) => `AIza${randomString(rng, 35)}`,
	},
	{
		name: 'slack-token',
		gen: (rng) => `xoxb-${randomString(rng, 12)}`,
	},
	{
		name: 'stripe-key',
		gen: (rng) => `sk_live_${randomString(rng, 16)}`,
	},
	{
		name: 'openai-key',
		gen: (rng) => `sk-${randomString(rng, 20)}`,
	},
	{
		name: 'jwt',
		gen: (rng) =>
			`eyJ${randomString(rng, 12)}.${randomString(rng, 12)}.${randomString(rng, 12)}`,
	},
	{
		name: 'assignment',
		gen: (rng) => `api_key: ${randomString(rng, 10)}`,
	},
];

const TRIALS = 50;

describe('redactSecrets (property-based, M32)', async () => {
	it.each(
		SECRET_GENERATORS,
	)('always redacts a generated $name secret embedded in prose', ({
		gen,
	}) => {
		const rng = mulberry32(0xc0ffee ^ gen.length);
		for (let i = 0; i < TRIALS; i++) {
			const secret = gen(rng);
			const input = `${randomSentence(rng, 3)} ${secret} ${randomSentence(rng, 3)}`;
			const { text, redactions } = redactSecrets(input);
			expect(redactions).toBeGreaterThan(0);
			expect(text).not.toContain(secret);
		}
	});

	it('never flags plain prose with no secret-shaped substring (no false positives)', async () => {
		const rng = mulberry32(1234);
		for (let i = 0; i < TRIALS; i++) {
			const input = randomSentence(rng, 8);
			const { text, redactions } = redactSecrets(input);
			expect(redactions).toBe(0);
			expect(text).toBe(input);
		}
	});

	it('is idempotent: redacting an already-redacted text redacts nothing further', async () => {
		const rng = mulberry32(777);
		for (const { gen } of SECRET_GENERATORS) {
			for (let i = 0; i < 5; i++) {
				const secret = gen(rng);
				const once = redactSecrets(
					`${randomSentence(rng, 2)} ${secret} ${randomSentence(rng, 2)}`,
				);
				const twice = redactSecrets(once.text);
				expect(twice.text).toBe(once.text);
				expect(twice.redactions).toBe(0);
			}
		}
	});

	it('never throws on arbitrary random byte-ish input (total function)', async () => {
		const rng = mulberry32(99);
		for (let i = 0; i < TRIALS; i++) {
			const input = randomString(rng, Math.floor(rng() * 200));
			expect(() => redactSecrets(input)).not.toThrow();
		}
	});
});
