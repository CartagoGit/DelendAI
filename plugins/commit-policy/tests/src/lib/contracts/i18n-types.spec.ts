import { describe, expect, it } from 'vitest';

import {
	localizedScopeRefusalTip,
	type ConventionalHeaderRefusalCode,
} from '@delendai/commit-policy/lib/contracts/i18n-types';

describe('localizedScopeRefusalTip', () => {
	const cases: ReadonlyArray<{
		readonly locale: string | undefined;
		readonly code: ConventionalHeaderRefusalCode;
		readonly expected: string;
	}> = [
		{
			locale: 'en',
			code: 'EMPTY_HEADER',
			expected:
				'Provide a Conventional Commit header like "fix: subject" before auto-scoping it.',
		},
		{
			locale: 'en',
			code: 'MALFORMED_HEADER',
			expected:
				'Use the Conventional Commit form "type(scope)!: subject" or "type: subject".',
		},
		{
			locale: 'es',
			code: 'EMPTY_HEADER',
			expected:
				'Proporciona primero un header Conventional Commit como "fix: asunto" antes de aplicar auto-scope.',
		},
		{
			locale: 'es',
			code: 'MALFORMED_HEADER',
			expected:
				'Usa el formato Conventional Commit "type(scope)!: asunto" o "type: asunto".',
		},
		{
			locale: undefined,
			code: 'EMPTY_HEADER',
			expected:
				'Provide a Conventional Commit header like "fix: subject" before auto-scoping it.',
		},
	];

	for (const testCase of cases) {
		it(`returns the localized tip for ${testCase.code} in ${testCase.locale ?? 'default'}`, () => {
			expect(
				localizedScopeRefusalTip(testCase.locale, testCase.code),
			).toBe(testCase.expected);
		});
	}
});
