/**
 * documentation-language.service.ts — what a project writes is in the
 * language it declared.
 *
 * A project states the language of its documents once. Reviewers of a
 * swarm wrote their verdicts in whichever language their prompt was in,
 * so an English proposal ended with a Spanish paragraph in the middle of
 * it: every later reader, person or model, meets a document in two
 * languages, and a search for a word finds half of what was said.
 *
 * Only English is recognised from the outside. Telling it from the
 * languages agents here are prompted in is enough to catch the mistake;
 * a general language detector would be a dependency for one sentence.
 */

/**
 * Letters and marks English prose does not use: the accented vowels, the
 * tilde and cedilla letters, the sharp s and the inverted marks, written
 * as escapes so this file is itself plain English text.
 */
const NON_ENGLISH_CHARACTER =
	/[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc\u00e0\u00e8\u00ec\u00f2\u00f9\u00e2\u00ea\u00ee\u00f4\u00fb\u00e7\u00e3\u00f5\u00e4\u00f6\u00df\u00bf\u00a1]/iu;

/**
 * Words that carry a sentence in Spanish, Portuguese, French or Italian
 * and are not English words: three different ones in a text settle it.
 */
const ROMANCE_FUNCTION_WORDS: ReadonlySet<string> = new Set([
	'que',
	'del',
	'los',
	'las',
	'pero',
	'porque',
	'esta',
	'este',
	'estos',
	'una',
	'unos',
	'unas',
	'hay',
	'cuando',
	'donde',
	'pues',
	'entonces',
	'sobre',
	'entre',
	'desde',
	'hasta',
	'puede',
	'puedo',
	'debe',
	'tiene',
	'falta',
	'hacer',
	'siendo',
	'nao',
	'pour',
	'avec',
	'sont',
	'dans',
	'mais',
	'cette',
	'sono',
	'della',
	'anche',
	'questo',
	'aunque',
	'ademas',
	'mismo',
	'cada',
	'todos',
	'ningun',
	'cual',
	// The smallest ones: none is an English word a verdict uses.
	'el',
	'la',
	'en',
	'un',
	'con',
	'por',
	'para',
	'es',
	'se',
	'lo',
	'al',
	'su',
	'ya',
	'muy',
	'mas',
	'les',
	'des',
	'il',
	'di',
	'da',
	'um',
	'uma',
	'mismo',
	'cada',
	'todos',
	'ningun',
	'cual',
]);

/** How many such words make a text not English. */
const FUNCTION_WORDS_NEEDED = 3;

/** Whether `text` is, by its letters or its small words, not English. */
export const looksNonEnglish = (text: string): boolean => {
	if (NON_ENGLISH_CHARACTER.test(text)) return true;
	const found = new Set(
		text
			.toLowerCase()
			.split(/[^a-z]+/u)
			.filter((word) => ROMANCE_FUNCTION_WORDS.has(word)),
	);
	return found.size >= FUNCTION_WORDS_NEEDED;
};

/**
 * Why `text` may not be recorded under the declared language, or
 * `undefined` when it may: no language declared, one this cannot judge,
 * or text that reads as that language.
 */
export const languageRefusal = (
	text: string,
	declared: string | undefined,
): string | undefined =>
	declared === 'en' && looksNonEnglish(text)
		? 'This project writes its documents in English (`documentationLanguage: "en"`), and this text is not: write it in English, whatever language you were asked in.'
		: undefined;
