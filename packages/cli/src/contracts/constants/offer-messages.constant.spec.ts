/**
 * offer-messages.constant.spec.ts — every account-offer message exists in
 * every language and says something, whatever it is given.
 */
import { describe, expect, it } from 'vitest';

import {
	OFFER_LANGS,
	OFFER_MESSAGES,
	offerMessagesFor,
} from './offer-messages.constant';

/** Each message, called with plausible arguments when it is a function. */
const rendered = (value: unknown): readonly string[] => {
	if (typeof value === 'string') return [value];
	if (typeof value === 'function') {
		const fn = value as (...args: unknown[]) => unknown;
		const results = [
			fn('x', 1),
			fn(2, 3),
			fn(true, true),
			fn(false, false),
			fn({ displayName: 'D' }),
			fn({ displayName: 'D', subject: 'S', via: 'V' }),
			fn({ displayName: 'D', credentialEnv: 'K_API_KEY' }),
			fn({ displayName: 'D', port: 8080 }),
		];
		return results.map(String);
	}
	if (value !== null && typeof value === 'object')
		return Object.values(value).flatMap(rendered);
	return [String(value)];
};

// Word lists (the answers each language accepts) differ in length by design.
const keysOf = (value: unknown, prefix = ''): readonly string[] =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? Object.entries(value).flatMap(([key, inner]) => [
				`${prefix}${key}`,
				...keysOf(inner, `${prefix}${key}.`),
			])
		: [];

describe('the account offer messages', () => {
	it('has the same messages in every language', () => {
		const english = [...keysOf(OFFER_MESSAGES.en)].sort();
		for (const lang of OFFER_LANGS)
			expect([...keysOf(OFFER_MESSAGES[lang])].sort(), lang).toEqual(
				english,
			);
	});

	it('says something for every message, in every language', () => {
		for (const lang of OFFER_LANGS)
			for (const text of rendered(OFFER_MESSAGES[lang]))
				expect(text.length, lang).toBeGreaterThan(0);
	});

	it('falls back to English for a language it does not speak', () => {
		expect(offerMessagesFor('xx')).toBe(OFFER_MESSAGES.en);
		expect(offerMessagesFor('es')).toBe(OFFER_MESSAGES.es);
	});
});
