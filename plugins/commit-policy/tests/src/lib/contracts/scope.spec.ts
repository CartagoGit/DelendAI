import { describe, expect, it } from 'vitest';

import {
	buildScopedMessage,
	parseHeader,
} from '@mcp-vertex/commit-policy/lib/contracts/scope';

const DEFAULT_SCOPE = 'f00181';

const recomposeHeader = (input: string): string => {
	const parsed = parseHeader(input);
	expect(parsed.ok).toBe(true);
	if (!parsed.ok) {
		return input;
	}
	const scope =
		parsed.value.scope === undefined ? '' : `(${parsed.value.scope})`;
	const bang = parsed.value.breaking ? '!' : '';
	return `${parsed.value.type}${scope}${bang}: ${parsed.value.subject}${parsed.value.rest}`;
};

describe('contracts/scope (x00259 S1)', () => {
	it('covers the 10-case truth table as an invertible parse/build contract without throwing on refusals', () => {
		const cases: ReadonlyArray<{
			readonly input: string;
			readonly expected?: string;
			readonly refusal?: 'EMPTY_HEADER' | 'MALFORMED_HEADER';
		}> = [
			{ input: 'fix: x', expected: 'fix(f00181): x' },
			{ input: 'fix(core): x', expected: 'fix(core): x' },
			{ input: 'fix!: x', expected: 'fix(f00181)!: x' },
			{ input: 'fix(scope)!: x', expected: 'fix(scope)!: x' },
			{ input: 'chore: x', expected: 'chore(f00181): x' },
			{ input: 'xyz: x', expected: 'xyz(f00181): x' },
			{
				input: 'feat(deps): bump x',
				expected: 'feat(deps): bump x',
			},
			{
				input: 'refactor!: cambia API',
				expected: 'refactor(f00181)!: cambia API',
			},
			{ input: '', refusal: 'EMPTY_HEADER' },
			{ input: 'hola', refusal: 'MALFORMED_HEADER' },
		];

		for (const testCase of cases) {
			const action = () =>
				buildScopedMessage(testCase.input, {
					defaultScope: DEFAULT_SCOPE,
				});
			expect(action).not.toThrow();
			const result = action();
			if (testCase.refusal !== undefined) {
				expect(() => parseHeader(testCase.input)).not.toThrow();
				const parsed = parseHeader(testCase.input);
				expect(parsed.ok).toBe(false);
				if (!parsed.ok) {
					expect(parsed.code).toBe(testCase.refusal);
					expect(parsed.tip.length).toBeGreaterThan(0);
				}
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.code).toBe(testCase.refusal);
					expect(result.tip.length).toBeGreaterThan(0);
				}
				continue;
			}

			const recomposed = recomposeHeader(testCase.input);
			expect(recomposed).toBe(testCase.input);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(testCase.expected);
				const reparsed = parseHeader(result.value);
				expect(reparsed.ok).toBe(true);
				if (reparsed.ok) {
					const rebuilt = buildScopedMessage(
						recomposeHeader(result.value),
						{
							defaultScope: DEFAULT_SCOPE,
						},
					);
					expect(rebuilt.ok).toBe(true);
					if (rebuilt.ok) {
						expect(rebuilt.value).toBe(result.value);
					}
				}
			}
		}
	});

	it('preserves custom type, existing scope and breaking marker structure when parsing', () => {
		const valid = parseHeader('xyz(core)!: x');
		expect(valid.ok).toBe(true);
		if (valid.ok) {
			expect(valid.value.type).toBe('xyz');
			expect(valid.value.scope).toBe('core');
			expect(valid.value.breaking).toBe(true);
			expect(valid.value.subject).toBe('x');
			expect(valid.value.rest).toBe('');
		}
	});

	it('separates the subject from the preserved multiline suffix when parsing', () => {
		const input =
			'fix!: x\r\n\r\nDetailed explanation here.\r\n\r\nCo-authored-by: agent <agent@example.com>';
		const parsed = parseHeader(input);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.type).toBe('fix');
			expect(parsed.value.scope).toBeUndefined();
			expect(parsed.value.breaking).toBe(true);
			expect(parsed.value.subject).toBe('x');
			expect(parsed.value.rest).toBe(
				'\r\n\r\nDetailed explanation here.\r\n\r\nCo-authored-by: agent <agent@example.com>',
			);
			expect(recomposeHeader(input)).toBe(input);
		}
	});

	it('preserves original CRLF separators when adding a default scope', () => {
		const input =
			'fix!: x\r\n\r\nDetailed explanation here.\r\n\r\nCo-authored-by: agent <agent@example.com>';
		const built = buildScopedMessage(input, {
			defaultScope: DEFAULT_SCOPE,
		});
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.value).toBe(
				'fix(f00181)!: x\r\n\r\nDetailed explanation here.\r\n\r\nCo-authored-by: agent <agent@example.com>',
			);
		}
	});
	it('preserves body and footers when scoping a plain header', () => {
		const input =
			'fix: x\n\nDetailed explanation here.\n\nCo-authored-by: agent <agent@example.com>';
		const built = buildScopedMessage(input, {
			defaultScope: DEFAULT_SCOPE,
		});
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.value).toBe(
				'fix(f00181): x\n\nDetailed explanation here.\n\nCo-authored-by: agent <agent@example.com>',
			);
		}
	});

	it('returns the exact raw message when the header already has scope and uses CRLF', () => {
		const input =
			'fix(core): x\r\n\r\nDetailed explanation here.\r\n\r\nCo-authored-by: agent <agent@example.com>';
		const built = buildScopedMessage(input, {
			defaultScope: DEFAULT_SCOPE,
		});
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.value).toBe(input);
		}
	});

	it('flags malformed double bang headers as typed refusal', () => {
		const parsed = parseHeader('feat!!: x', 'es');
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.code).toBe('MALFORMED_HEADER');
			expect(parsed.tip).toBe(
				'Usa el formato Conventional Commit "type(scope)!: asunto" o "type: asunto".',
			);
		}
	});
});
