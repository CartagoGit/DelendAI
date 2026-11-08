import { describe, expect, it } from 'vitest';

import { resolveCheckMode, runCheck } from './check-i18n';

const LANGS = [{ code: 'en' }, { code: 'es' }] as const;

describe('check-i18n mode resolution', () => {
	it('keeps warn mode explicit and upgrades to strict when requested', () => {
		expect(resolveCheckMode(['bun', 'scripts/check-i18n.ts'])).toBe('warn');
		expect(
			resolveCheckMode(['bun', 'scripts/check-i18n.ts', '--warn']),
		).toBe('warn');
		expect(
			resolveCheckMode(['bun', 'scripts/check-i18n.ts', '--strict']),
		).toBe('strict');
	});
});

describe('check-i18n strict gate', () => {
	it('fails deterministically in strict mode when a locale misses a key', () => {
		const result = runCheck(
			{
				siteDictsByLang: {
					en: { nav: { home: 'Home', docs: 'Docs' } },
					es: { nav: { home: 'Inicio' } },
				},
				siteLanguages: LANGS,
				sharedDictsByLang: {
					en: { common: { ok: 'OK' } },
					es: { common: { ok: 'Vale' } },
				},
				sharedLanguages: LANGS,
				registeredTools: [],
				authoredEnglishExtension: { title: 'Settings' },
				authoredSpanishExtension: { title: 'Configuracion' },
			},
			'strict',
		);

		expect(result.siteProblems).toContain(
			'[es] missing 1/2 keys: nav.docs',
		);
		expect(result.shouldFail).toBe(true);
	});

	it('reports the same missing key in warn mode without failing the build gate', () => {
		const result = runCheck(
			{
				siteDictsByLang: {
					en: { nav: { home: 'Home', docs: 'Docs' } },
					es: { nav: { home: 'Inicio' } },
				},
				siteLanguages: LANGS,
				sharedDictsByLang: {
					en: { common: { ok: 'OK' } },
					es: { common: { ok: 'Vale' } },
				},
				sharedLanguages: LANGS,
				registeredTools: [],
				authoredEnglishExtension: { title: 'Settings' },
				authoredSpanishExtension: { title: 'Configuracion' },
			},
			'warn',
		);

		expect(result.siteProblems).toContain(
			'[es] missing 1/2 keys: nav.docs',
		);
		expect(result.shouldFail).toBe(false);
	});
});
