/**
 * spend-confirmation.service.ts — the user confirms a spend, nobody else.
 *
 * The invocation manager asks its confirmation gate before every hop that
 * may spend, and verifies the token it gets back. With no gate wired it
 * denied every spend, so `confirmBeforeExecute` (on by default) made
 * paid execution impossible rather than confirmed. This gate asks the
 * user through the host's MCP elicitation, and on a yes mints the token
 * with the same signer the manager verifies with. The server is only
 * known once a tool registers, so the ask is read when a spend comes;
 * before that, or on a host that cannot ask, nothing is spent.
 */
import { spendQuestion } from '../contracts/constants/spend-confirmation.constant';
import type { IConsentAsk } from '../contracts/interfaces/discovery-consent.interface';
import type { ConfirmationSigner, IConfirmationGate } from '../invoke/token';

export const elicitedConfirmationGate = (
	askOf: () => IConsentAsk | undefined,
	signer: ConfirmationSigner,
): IConfirmationGate => ({
	confirm: async (spend) => {
		const ask = askOf();
		if (ask === undefined) return null;
		const answer = await ask(
			spendQuestion(spend.providerId, spend.estimatedCostTier),
		);
		return answer === 'accept' ? signer.mint(spend) : null;
	},
});
