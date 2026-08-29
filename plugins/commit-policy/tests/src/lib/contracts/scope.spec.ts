import { describe, expect, it } from 'vitest';

import {
	buildScopedMessage,
	parseHeader,
} from '@mcp-vertex/commit-policy/lib/contracts/scope';

const DEFAULT_SCOPE = 'f00181';

describe('contracts/scope (x00259 S1)', () => {
	it('covers the 10-case truth table without throwing on invalid headers', () => {
		const cases: ReadonlyArray<{
			readonly input: string;
			readonly expected?: string;
			readonly refusal?: 'EMPTY_HEADER' | 'MALFORMED_HEADER';
		}> = [
			{ input: 'feat: x', expected: 'feat(f00181): x' },
			{ input: 'fix: x', expected: 'fix(f00181): x' },
			{ input: 'fix!: x', expected: 'fix(f00181)!: x' },
			{ input: 'fix(core): x', expected: 'fix(core): x' },
			{ input: 'fix(core)!: x', expected: 'fix(core)!: x' },
			{ input: 'chore: x', expected: 'chore(f00181): x' },
			{ input: 'refactor: x', expected: 'refactor(f00181): x' },
			{ input: 'xyz: x', expected: 'xyz(f00181): x' },
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
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.code).toBe(testCase.refusal);
					expect(result.tip.length).toBeGreaterThan(0);
				}
				continue;
			}
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(testCase.expected);
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
			expect(valid.value.rest).toBe('x');
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
