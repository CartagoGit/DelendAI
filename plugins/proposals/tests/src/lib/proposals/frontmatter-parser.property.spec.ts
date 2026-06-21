import { describe, expect, it } from 'vitest';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '@mcp-vertex/proposals/lib/proposals/frontmatter-parser';

/**
 * Property-based coverage for the hand-rolled YAML-subset parser (M32).
 * `frontmatter-parser.ts` had zero dedicated tests despite being the single
 * source of truth for every proposal's frontmatter (status, slices, dates) —
 * it was only exercised indirectly through higher-level proposal specs.
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

const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'l110', 'slice', 'done'];
const randomWord = (rng: () => number): string =>
	WORDS[Math.floor(rng() * WORDS.length)] ?? 'x';

const randomScalar = (rng: () => number): string | number | boolean => {
	const kind = Math.floor(rng() * 4);
	if (kind === 0) return randomWord(rng);
	if (kind === 1) return Math.floor(rng() * 1000);
	if (kind === 2) return rng() > 0.5;
	return `${randomWord(rng)}-${randomWord(rng)}`;
};

const TRIALS = 50;

describe('parseFrontmatterBlock (property-based, M32)', () => {
	it('round-trips flat root-level scalars (key: value)', () => {
		const rng = mulberry32(42);
		for (let i = 0; i < TRIALS; i++) {
			const keys = Array.from(
				{ length: 1 + Math.floor(rng() * 5) },
				(_, idx) => `key${idx}`,
			);
			const expected: Record<string, string | number | boolean> = {};
			const lines: string[] = [];
			for (const key of keys) {
				const value = randomScalar(rng);
				expected[key] = value;
				lines.push(`${key}: ${value}`);
			}
			const parsed = parseFrontmatterBlock(lines.join('\n'));
			for (const key of keys) {
				expect(parsed[key]).toBe(expected[key]);
			}
		}
	});

	it('round-trips a block array of scalars (key:\\n  - item)', () => {
		const rng = mulberry32(7);
		for (let i = 0; i < TRIALS; i++) {
			const items = Array.from(
				{ length: 1 + Math.floor(rng() * 4) },
				() => randomWord(rng),
			);
			const block = [
				'related:',
				...items.map((item) => `  - ${item}`),
			].join('\n');
			const parsed = parseFrontmatterBlock(block);
			expect(parsed.related).toEqual(items);
		}
	});

	it('round-trips an inline empty array (key: [])', () => {
		const rng = mulberry32(13);
		for (let i = 0; i < TRIALS; i++) {
			const key = `field${Math.floor(rng() * 100)}`;
			const parsed = parseFrontmatterBlock(`${key}: []`);
			expect(parsed[key]).toEqual([]);
		}
	});

	// f00016 S5 regression: `blocked_by: [self:goal-missing]` is the
	// documented convention (f00016 §9). Each token may itself contain a
	// colon — must stay a single scalar string, not be mistaken for a
	// nested `key: value` mapping the way the block-array parser would
	// read the same token shape.
	it('round-trips an inline non-empty array, including tokens with colons', () => {
		const rng = mulberry32(2025);
		for (let i = 0; i < TRIALS; i++) {
			const items = Array.from(
				{ length: 1 + Math.floor(rng() * 3) },
				() => `self:${randomWord(rng)}`,
			);
			const parsed = parseFrontmatterBlock(
				`blocked_by: [${items.join(', ')}]`,
			);
			expect(parsed.blocked_by).toEqual(items);
		}
	});

	it('extractYamlBlock + parseFrontmatterBlock never throws on arbitrary markdown', () => {
		const rng = mulberry32(2024);
		const CHARS = '---\nabc: 123\n  - x\nfoo\n:::***';
		for (let i = 0; i < TRIALS; i++) {
			const length = Math.floor(rng() * 300);
			let raw = '';
			for (let j = 0; j < length; j++) {
				raw += CHARS[Math.floor(rng() * CHARS.length)];
			}
			expect(() => {
				const block = extractYamlBlock(raw);
				if (block !== null) parseFrontmatterBlock(block);
			}).not.toThrow();
		}
	});

	it('extractYamlBlock recovers exactly the content between the first --- pair', () => {
		const rng = mulberry32(55);
		for (let i = 0; i < TRIALS; i++) {
			const key = randomWord(rng);
			const value = randomScalar(rng);
			const body = `${key}: ${value}`;
			const raw = `---\n${body}\n---\n\n# heading\n\nbody text`;
			expect(extractYamlBlock(raw)).toBe(body);
		}
	});
});
