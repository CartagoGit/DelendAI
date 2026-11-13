/**
 * cli-language.service.spec.ts — which language delendai speaks: the
 * variable, then the saved choice, then the locale; `C` names none.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	cliLanguage,
	languageOfLocale,
	languagePath,
	localeLanguage,
	readSavedLanguage,
	saveLanguage,
} from './cli-language.service';

const temp = (): string =>
	join(mkdtempSync(join(tmpdir(), 'lang-')), 'delendai', 'language.json');

describe('the language delendai speaks', () => {
	it('reads the language of a locale, and none from C or POSIX', () => {
		expect(languageOfLocale('es_ES.UTF-8')).toBe('es');
		expect(languageOfLocale('pt_BR')).toBe('pt');
		expect(languageOfLocale('fr:en')).toBe('fr');
		expect(languageOfLocale('C.UTF-8')).toBeUndefined();
		expect(languageOfLocale('POSIX')).toBeUndefined();
		expect(languageOfLocale('')).toBeUndefined();
		expect(languageOfLocale(undefined)).toBeUndefined();
	});

	it('reads the locale variables in the order POSIX does', () => {
		expect(localeLanguage({ LANG: 'de_DE.UTF-8', LC_ALL: 'es_ES' })).toBe(
			'es',
		);
		expect(localeLanguage({ LANG: 'C.UTF-8', LANGUAGE: 'it' })).toBe('it');
		expect(localeLanguage({ LANG: 'C.UTF-8' })).toBeUndefined();
	});

	it('keeps a saved choice beside the other delendai files', async () => {
		expect(languagePath('/root')).toBe(
			join('/root', 'delendai', 'language.json'),
		);
		const path = temp();
		expect(await readSavedLanguage(path)).toBeUndefined();
		await saveLanguage('es', path);
		expect(await readSavedLanguage(path)).toBe('es');
	});

	it('reads nothing from a file that holds no language', async () => {
		const path = temp();
		await saveLanguage('en', path);
		writeFileSync(path, 'not json');
		expect(await readSavedLanguage(path)).toBeUndefined();
		writeFileSync(path, '{"lang": 3}');
		expect(await readSavedLanguage(path)).toBeUndefined();
	});

	it('takes the variable, then the saved choice, then the locale', async () => {
		const path = temp();
		expect(await cliLanguage({ LANG: 'C.UTF-8' }, path)).toBeUndefined();
		expect(await cliLanguage({ LANG: 'es_ES' }, path)).toBe('es');
		await saveLanguage('fr', path);
		expect(await cliLanguage({ LANG: 'es_ES' }, path)).toBe('fr');
		expect(
			await cliLanguage({ DELENDAI_LANG: 'de', LANG: 'es_ES' }, path),
		).toBe('de');
		expect(await cliLanguage({ DELENDAI_LANG: ' ' }, path)).toBe('fr');
	});
});
