import { describe, expect, it } from 'vitest';

import { validateInterpolation } from '../../../src/lib/validate/validate-interpolation';

describe('validateInterpolation', () => {
	it('accepts matching ICU plural/select placeholders across locales', () => {
		expect(
			validateInterpolation([
				{
					locale: 'en',
					data: {
						items: '{count, plural, one {# item} other {# items}}',
						owner: '{gender, select, male {his} female {her} other {their}}',
					},
				},
				{
					locale: 'es',
					data: {
						items: '{count, plural, one {# articulo} other {# articulos}}',
						owner: '{gender, select, male {su} female {su} other {su}}',
					},
				},
			]),
		).toEqual([]);
	});

	it('flags ICU placeholder mismatches, malformed ICU, and extra locale keys', () => {
		const findings = validateInterpolation([
			{
				locale: 'en',
				data: {
					items: '{count, plural, one {# item} other {# items}}',
					status: '{gender, select, male {his} female {her} other {their}}',
				},
			},
			{
				locale: 'es',
				data: {
					items: '{total, plural, one {# articulo} other {# articulos}}',
					status: '{gender, select, male {su} female {su} other {su}',
					extra: 'Solo en es',
				},
			},
		]);
		expect(
			findings.some(
				(finding) => finding.ruleId === 'placeholder-mismatch',
			),
		).toBe(true);
		expect(
			findings.some((finding) => finding.ruleId === 'malformed-icu'),
		).toBe(true);
		expect(
			findings.some((finding) => finding.ruleId === 'extra-locale'),
		).toBe(true);
	});
});
