/**
 * init-accounts-offer.service.spec.ts — an interactive init offers the
 * accounts found once; one without a terminal offers nothing.
 */
import { describe, expect, it } from 'vitest';

import type { IInitOfferDeps } from '../../contracts/interfaces/init-offer.interface';
import { offerAccountsAfterInit } from './init-accounts-offer.service';

const offerOf =
	(answers: boolean[]): IInitOfferDeps['offer'] =>
	async (input) => {
		const offer = {
			accountId: 'anthropic-claude',
			vendor: 'anthropic',
			displayName: 'Claude Code (CLI), as logged in on this machine',
			credentialMode: 'official-subscription-login' as const,
			billingMode: 'subscription-included' as const,
			quotaGroups: ['anthropic-claude'],
			permittedAutomation: false,
		};
		answers.push((await input.ask(offer)) === true);
		answers.push((await input.askAutomation?.(offer)) === true);
		return {
			personalLayer: '/cfg/p.json',
			offered: [offer],
			added: answers[0] === true ? [offer.accountId] : [],
			declined: [],
			unclassified: [],
		};
	};

describe('offerAccountsAfterInit', () => {
	it('asks once in a terminal, reports what was added, and closes the prompt', async () => {
		const answers: boolean[] = [];
		const lines: string[] = [];
		const asked: string[] = [];
		let closed = false;
		await offerAccountsAfterInit('/ws', {
			interactive: () => true,
			open: () => ({
				question: (
					question: string,
					answer: (text: string) => void,
				) => {
					asked.push(question);
					answer('y');
				},
				close: () => {
					closed = true;
				},
			}),
			offer: offerOf(answers),
			report: (line) => lines.push(line),
		});
		expect(answers).toEqual([true, true]);
		expect(asked[1]).toContain('unattended work');
		expect(asked[0]).toContain('to your own file for this project');
		expect(lines[0]).toContain('anthropic-claude');
		expect(closed).toBe(true);
	});

	it('offers nothing without a terminal', async () => {
		const answers: boolean[] = [];
		await offerAccountsAfterInit('/ws', {
			interactive: () => false,
			open: () => {
				throw new Error('must not open');
			},
			offer: offerOf(answers),
			report: () => undefined,
		});
		expect(answers).toEqual([]);
	});
});
