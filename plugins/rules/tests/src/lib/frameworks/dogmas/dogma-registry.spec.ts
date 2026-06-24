/**
 * f00051 S3 — priority-family dogma adapters.
 *
 * Each `dogmas/<lang>.dogma.ts` is the SINGLE place that declares
 * one language's idiomatic style (S + I per the proposal's
 * per-module contract). This spec asserts, per language:
 *   1. the adapter resolves through `DogmaRegistry` (the DIP seam);
 *   2. its dimensions match the documented idioms (the principle the
 *      module embodies);
 *   3. its bullets are LANGUAGE-SPECIFIC, never generic ESLint-style
 *      advice (the S3 acceptance bar).
 */
import { describe, expect, it } from 'vitest';

import { DogmaRegistry } from '@mcp-vertex/rules/lib/frameworks/registry';
import {
	CSHARP_DOGMA,
	DEFAULT_DOGMA_ADAPTERS,
	ELIXIR_DOGMA,
	GO_DOGMA,
	JAVA_DOGMA,
	KOTLIN_DOGMA,
	PYTHON_DOGMA,
	RUBY_DOGMA,
	RUST_DOGMA,
	SWIFT_DOGMA,
} from '@mcp-vertex/rules/lib/frameworks/dogmas';

const registry = new DogmaRegistry(DEFAULT_DOGMA_ADAPTERS);

// A bullet is "ESLint-style" if it reads like generic JS lint advice.
// The S3 bar rejects these for non-JS languages.
const ESLINT_TELLS = [
	'eslint',
	'no-var',
	'prefer-const',
	'react',
	'jsx',
	'tsconfig',
	'typescript-eslint',
];

const isLanguageSpecific = (bullets: readonly string[]): boolean =>
	bullets.some((b) => {
		const lower = b.toLowerCase();
		return !ESLINT_TELLS.some((tell) => lower.includes(tell));
	});

describe('f00051 S3 — DogmaRegistry serves the priority families', () => {
	it('registers exactly the 9 priority-family languages', () => {
		expect(registry.supportedLanguages).toEqual([
			'cs',
			'ex',
			'go',
			'java',
			'kt',
			'py',
			'rb',
			'rs',
			'swift',
		]);
	});

	const CASES = [
		{
			dogma: PYTHON_DOGMA,
			lang: 'py',
			ownership: 'gc',
			errorModel: 'exceptions',
			naming: 'snake_case',
			pm: 'pip',
		},
		{
			dogma: GO_DOGMA,
			lang: 'go',
			ownership: 'gc',
			errorModel: 'multi-return',
			naming: 'mixed',
			pm: 'go mod',
		},
		{
			dogma: RUST_DOGMA,
			lang: 'rs',
			ownership: 'borrow-checker',
			errorModel: 'result',
			naming: 'snake_case',
			pm: 'cargo',
		},
		{
			dogma: RUBY_DOGMA,
			lang: 'rb',
			ownership: 'gc',
			errorModel: 'exceptions',
			naming: 'snake_case',
			pm: 'bundler',
		},
		{
			dogma: JAVA_DOGMA,
			lang: 'java',
			ownership: 'gc',
			errorModel: 'exceptions',
			naming: 'PascalCase',
			pm: 'gradle',
		},
		{
			dogma: KOTLIN_DOGMA,
			lang: 'kt',
			ownership: 'gc',
			errorModel: 'exceptions',
			naming: 'PascalCase',
			pm: 'gradle',
		},
		{
			dogma: SWIFT_DOGMA,
			lang: 'swift',
			ownership: 'arc',
			errorModel: 'exceptions',
			naming: 'lowerCamelCase',
			pm: 'swiftpm',
		},
		{
			dogma: CSHARP_DOGMA,
			lang: 'cs',
			ownership: 'gc',
			errorModel: 'exceptions',
			naming: 'PascalCase',
			pm: 'nuget',
		},
		{
			dogma: ELIXIR_DOGMA,
			lang: 'ex',
			ownership: 'gc',
			errorModel: 'sum-types',
			naming: 'snake_case',
			pm: 'mix',
		},
	] as const;

	for (const c of CASES) {
		it(`${c.lang}: resolves with its documented idioms (one module = one truth)`, () => {
			const resolved = registry.resolve(c.lang);
			expect(resolved).toBe(c.dogma);
			expect(resolved?.ownership).toBe(c.ownership);
			expect(resolved?.errorModel).toBe(c.errorModel);
			expect(resolved?.naming).toBe(c.naming);
			expect(resolved?.packageManager).toBe(c.pm);
			expect(resolved?.version).toMatch(/\w/);
			expect(resolved?.bullets.length).toBeGreaterThanOrEqual(3);
			// 3-7 is the proposal guideline; RUST_DOGMA predates S3 with 8.
			expect(resolved?.bullets.length).toBeLessThanOrEqual(8);
		});

		it(`${c.lang}: bullets are language-specific, not ESLint-style`, () => {
			expect(isLanguageSpecific(c.dogma.bullets)).toBe(true);
		});
	}

	it('every shipped adapter has a complete, well-formed shape', () => {
		for (const d of DEFAULT_DOGMA_ADAPTERS) {
			expect(typeof d.language).toBe('string');
			expect(typeof d.packageManager).toBe('string');
			expect(typeof d.version).toBe('string');
			expect(d.bullets.length).toBeGreaterThanOrEqual(3);
			// displayName is optional but every priority family ships one.
			expect(typeof d.displayName).toBe('string');
		}
	});
});
