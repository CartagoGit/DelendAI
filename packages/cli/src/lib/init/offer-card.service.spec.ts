/**
 * offer-card.service.spec.ts — the offer's header, cards and summary.
 */
import { describe, expect, it } from 'vitest';

import { OFFER_MESSAGES } from '../../contracts/constants/offer-messages.constant';
import {
	cardWidth,
	modelsLine,
	offerCard,
	offerHeader,
	offerSummary,
	wrap,
} from './offer-card.service';

describe('the offer at a terminal', () => {
	it('keeps cards between 40 and 72 columns', () => {
		expect(cardWidth(undefined)).toBe(72);
		expect(cardWidth(0)).toBe(72);
		expect(cardWidth(200)).toBe(72);
		expect(cardWidth(20)).toBe(40);
		expect(cardWidth(60)).toBe(60);
	});

	it('wraps at spaces', () => {
		expect(wrap('one two three four', 9)).toEqual([
			'one two',
			'three',
			'four',
		]);
		expect(wrap('   ', 9)).toEqual([]);
	});

	it('opens with the title and what the offer does', () => {
		const header = offerHeader(OFFER_MESSAGES.en, 72);
		expect(header).toContain('Your AI accounts');
		expect(header).toContain('never the value of a key');
	});

	it('numbers a card and draws its left edge on every line', () => {
		const card = offerCard({
			index: 2,
			total: 9,
			kind: 'Key in your environment',
			title: 'Z.AI, key in ZHIPU_API_KEY',
			details: ['ZHIPU_API_KEY is set; its value is not read'],
			width: 72,
		});
		const lines = card.split('\n').filter((line) => line.length > 0);
		expect(lines[0]).toContain('╭─ 2/9 · Key in your environment');
		expect(lines.slice(1, -1).every((line) => line.includes('│'))).toBe(
			true,
		);
		expect(lines.at(-1)).toContain('╰─');
		expect(
			offerCard({
				index: 1,
				total: 1,
				kind: '',
				title: 't',
				details: [],
				width: 40,
			}),
		).not.toContain('·');
	});

	it('lists a few models and counts the rest', () => {
		expect(modelsLine(OFFER_MESSAGES.en, [])).toBeUndefined();
		expect(modelsLine(OFFER_MESSAGES.en, ['a', 'b'])).toBe('Models: a, b');
		expect(
			modelsLine(OFFER_MESSAGES.es, ['a', 'b', 'c', 'd', 'e']),
		).toContain('y 1 ');
	});

	it('ends with what was added, declined and left, and where it went', () => {
		const summary = offerSummary(OFFER_MESSAGES.en, {
			added: ['anthropic-claude'],
			declined: [],
			notAsked: 4,
			personalLayer: '/config/p.json',
		});
		expect(summary).toContain('Summary');
		expect(summary).toMatch(/Added\s+anthropic-claude/u);
		expect(summary).toMatch(/Declined\s+none/u);
		expect(summary).toContain('4 (run it again to go through them)');
		expect(summary).toContain('/config/p.json');
		expect(
			offerSummary(OFFER_MESSAGES.en, {
				added: [],
				declined: [],
				notAsked: 0,
				personalLayer: '/p',
			}),
		).not.toContain('Not asked yet');
	});
});
