/**
 * documentation-language.service.spec.ts — a text is refused only where
 * the project declared English and the text is plainly something else.
 */
import { describe, expect, it } from 'vitest';

import {
	languageRefusal,
	looksNonEnglish,
} from '@delendai/proposals/lib/services/documentation-language.service';

describe('looksNonEnglish', () => {
	it('reads English verdicts as English, whatever they quote', () => {
		for (const text of [
			'verified at abcdef012345, validate exit 0, tests 22/22 — covers the refusal',
			'The gate passes 6/6, but branchesLandingAsTheyAre reads the commit before it fetches.',
			'No commit names the slice; the note in `sin` and `todo` items is fine.',
			'',
		]) {
			expect(looksNonEnglish(text), text).toBe(false);
		}
	});

	it('recognises a verdict written in another language, with or without its accents', () => {
		for (const text of [
			'El candidato no satisface por sí solo la slice.',
			'El lint real esta verde pero la slice declara un gate que no existe',
			'O teste nao cobre este caso, falta uma verificacao para todos os ficheiros',
			'Le gate passe, mais cette vérification manque dans le code',
		]) {
			expect(looksNonEnglish(text), text).toBe(true);
		}
	});
});

describe('languageRefusal', () => {
	it('refuses only under a declared language this can judge', () => {
		const spanish = 'El cierre del plan no es consistente, falta una hija';
		expect(languageRefusal(spanish, 'en')).toContain('English');
		expect(languageRefusal(spanish, undefined)).toBeUndefined();
		expect(languageRefusal(spanish, 'es')).toBeUndefined();
		expect(
			languageRefusal('The plan does not add up.', 'en'),
		).toBeUndefined();
	});
});
