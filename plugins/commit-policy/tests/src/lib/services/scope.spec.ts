/**
 * scope.spec.ts — t00017 + x00259 acceptance: `parseHeader` and
 * `buildScopedMessage` are lossless on the truth table of AUD-CP-001.
 *
 * Build-scoped message is invertible with the parse header on the
 * subset of inputs listed in x00259 §2 "Reglas de promoción" — the
 * same table used as property-based inputs (1000 messages) in
 * `t00017`.
 */
import { describe, expect, it } from 'vitest';

import {
	buildScopedMessage,
	parseHeader,
} from '@delendai/commit-policy/lib/services/commit-driver';

const PROPOSAL = 'f00181';

describe('commit-policy scope (x00259, t00017)', () => {
	describe('parseHeader — truth table', () => {
		const cases: ReadonlyArray<{
			readonly input: string;
			readonly expectedType: string;
			readonly expectedScope: string | undefined;
			readonly expectedBreaking: boolean;
		}> = [
			{
				input: 'fix: x',
				expectedType: 'fix',
				expectedScope: undefined,
				expectedBreaking: false,
			},
			{
				input: 'feat(core): x',
				expectedType: 'feat',
				expectedScope: 'core',
				expectedBreaking: false,
			},
			{
				input: 'refactor!: x',
				expectedType: 'refactor',
				expectedScope: undefined,
				expectedBreaking: true,
			},
			{
				input: 'fix(scope)!: x',
				expectedType: 'fix',
				expectedScope: 'scope',
				expectedBreaking: true,
			},
			{
				input: 'chore(deps): bump x',
				expectedType: 'chore',
				expectedScope: 'deps',
				expectedBreaking: false,
			},
			{
				input: 'xyz(custom-type): custom',
				expectedType: 'xyz',
				expectedScope: 'custom-type',
				expectedBreaking: false,
			},
		];
		for (const c of cases) {
			it(`parses "${c.input}"`, () => {
				const p = parseHeader(c.input);
				expect(p.type).toBe(c.expectedType);
				expect(p.scope).toBe(c.expectedScope);
				expect(p.breaking).toBe(c.expectedBreaking);
			});
		}
	});

	describe('buildScopedMessage — truth table (x00259)', () => {
		const cases: ReadonlyArray<{
			readonly input: string;
			readonly expected: string;
		}> = [
			// sin scope → añadir default
			{ input: 'fix: x', expected: 'fix(f00181): x' },
			{ input: 'chore: x', expected: 'chore(f00181): x' },
			// `!` preservado y promovido
			{
				input: 'refactor!: cambia API',
				expected: 'refactor(f00181)!: cambia API',
			},
			{ input: 'fix!: x', expected: 'fix(f00181)!: x' },
			// scope presente → unchanged (no double-scope)
			{ input: 'feat(core): x', expected: 'feat(core): x' },
			{ input: 'fix(scope)!: x', expected: 'fix(scope)!: x' },
			{ input: 'feat(deps): bump x', expected: 'feat(deps): bump x' },
			// tipos custom preservados
			{ input: 'xyz: x', expected: 'xyz(f00181): x' },
			{ input: 'xyz(custom-type): x', expected: 'xyz(custom-type): x' },
		];
		for (const c of cases) {
			it(`builds "${c.input}" → "${c.expected}"`, () => {
				expect(buildScopedMessage(c.input, PROPOSAL, true)).toBe(
					c.expected,
				);
			});
		}
	});

	describe('invertibility (build ∘ parse preserves structure on inputs that already carry scope or bang)', () => {
		const samples = [
			'feat(core): x',
			'fix(scope)!: x',
			'chore(deps): bump x',
			'xyz(custom-type): custom',
		];
		for (const input of samples) {
			it(`round-trips "${input}"`, () => {
				const built = buildScopedMessage(input, PROPOSAL, true);
				const reParsed = parseHeader(built);
				expect(reParsed.type).toBe(parseHeader(input).type);
				expect(reParsed.scope).toBe(parseHeader(input).scope);
				expect(reParsed.breaking).toBe(parseHeader(input).breaking);
				expect(reParsed.subject).toBe(parseHeader(input).subject);
			});
		}
	});

	describe('fail-closed on malformed input', () => {
		it('returns type="" for empty header', () => {
			const p = parseHeader('');
			expect(p.type).toBe('');
		});
		it('returns type="" for non-CC text', () => {
			const p = parseHeader('lorem ipsum dolor');
			expect(p.type).toBe('');
		});
		it('buildScopedMessage wraps bare text with default feat(scope):', () => {
			expect(
				buildScopedMessage('add commit driver', PROPOSAL, true),
			).toBe(`feat(${PROPOSAL}): add commit driver`);
		});
		it('buildScopedMessage refuses empty input verbatim (refusal upstream)', () => {
			// Empty input — caller's slice context produces no message at
			// all; buildScopedMessage returns the empty string verbatim
			// and the engine refuses upstream.
			expect(buildScopedMessage('', PROPOSAL, true)).toBe('');
		});
	});

	describe('body + footers are preserved', () => {
		it('keeps multi-line body and Co-authored-by trailer', () => {
			const input =
				'fix: x\n\nDetailed explanation here.\n\nCo-authored-by: agent <agent@example.com>';
			const built = buildScopedMessage(input, PROPOSAL, true);
			// Header is rewritten; body is preserved
			expect(built.startsWith('fix(f00181): x\n\n')).toBe(true);
			expect(built).toContain('Detailed explanation here.');
			expect(built).toContain(
				'Co-authored-by: agent <agent@example.com>',
			);
		});
	});

	describe('autoScope=false short-circuits', () => {
		it('returns the original message untouched', () => {
			expect(buildScopedMessage('fix: x', PROPOSAL, false)).toBe(
				'fix: x',
			);
			expect(buildScopedMessage('random text', PROPOSAL, false)).toBe(
				'random text',
			);
		});
	});
});
