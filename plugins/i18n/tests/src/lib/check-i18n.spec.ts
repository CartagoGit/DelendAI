import { describe, expect, it } from 'vitest';

import { checkLocales, flattenKeys } from '../../../src/lib/i18n/check-i18n';
import type { ILocaleFile } from '../../../src/lib/contracts/interfaces/i18n.interface';

describe('flattenKeys', () => {
	it('flattens nested objects to dot keys', () => {
		expect(flattenKeys({ a: { b: 'x' }, c: 'y' })).toEqual({
			'a.b': 'x',
			c: 'y',
		});
	});
});

describe('checkLocales', () => {
	const locales: ILocaleFile[] = [
		{ locale: 'en', data: { greet: 'Hello {name}', bye: 'Bye' } },
		{ locale: 'es', data: { greet: 'Hola {name}' } },
		{ locale: 'fr', data: { greet: 'Bonjour {nom}', bye: 'Au revoir' } },
	];

	it('flags a key missing from a locale', () => {
		const findings = checkLocales(locales);
		const missing = findings.filter((f) => f.ruleId === 'missing-key');
		// es is missing `bye`
		expect(
			missing.some(
				(f) => f.message.includes('es') && f.message.includes('bye'),
			),
		).toBe(true);
	});

	it('flags a placeholder mismatch (fr uses {nom} not {name})', () => {
		const findings = checkLocales(locales);
		expect(
			findings.some(
				(f) =>
					f.ruleId === 'placeholder-mismatch' &&
					f.message.includes('fr'),
			),
		).toBe(true);
	});

	it('is clean when every locale has the same keys + placeholders', () => {
		expect(
			checkLocales([
				{ locale: 'en', data: { hi: 'Hi {n}' } },
				{ locale: 'es', data: { hi: 'Hola {n}' } },
			]),
		).toEqual([]);
	});
});
