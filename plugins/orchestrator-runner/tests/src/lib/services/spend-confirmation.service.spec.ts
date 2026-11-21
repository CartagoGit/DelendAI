import { describe, expect, it } from 'vitest';

import type { IConsentAsk } from '../../../../src/lib/contracts/interfaces/discovery-consent.interface';
import { ConfirmationSigner } from '../../../../src/lib/invoke/token';
import { elicitedConfirmationGate } from '../../../../src/lib/services/spend-confirmation.service';

const spend = {
	invocationId: 'inv-1',
	providerId: 'claude-work',
	estimatedCostTier: 3,
};

const answering = (answer: 'accept' | 'decline' | 'unavailable') => {
	const asked: string[] = [];
	const ask: IConsentAsk = async (question) => {
		asked.push(question);
		return answer;
	};
	return { ask, asked };
};

describe('elicitedConfirmationGate', () => {
	it('asks the user, and a yes mints the token the manager verifies', async () => {
		const signer = new ConfirmationSigner();
		const user = answering('accept');
		const token = await elicitedConfirmationGate(
			() => user.ask,
			signer,
		).confirm(spend);
		expect(token).not.toBeNull();
		expect(signer.verify(token ?? '', spend)).toBe(true);
		expect(
			signer.verify(token ?? '', { ...spend, invocationId: 'inv-2' }),
		).toBe(false);
		expect(user.asked[0]).toContain('claude-work (cost tier 3 of 5)');
	});

	it('spends nothing on a no, on a host that cannot ask, or before a tool registered', async () => {
		const signer = new ConfirmationSigner();
		expect(
			await elicitedConfirmationGate(
				() => answering('decline').ask,
				signer,
			).confirm(spend),
		).toBeNull();
		expect(
			await elicitedConfirmationGate(
				() => answering('unavailable').ask,
				signer,
			).confirm(spend),
		).toBeNull();
		expect(
			await elicitedConfirmationGate(() => undefined, signer).confirm(
				spend,
			),
		).toBeNull();
	});
});
