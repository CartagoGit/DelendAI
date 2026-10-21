/**
 * account-prompts.service.ts — the questions the offer of accounts asks,
 * the same in `delendai accounts offer` and at the end of `init`.
 */
import type {
	IAccountClassification,
	IAccountFinding,
	IProviderAccount,
} from '@delendai/core/contracts';
import { classificationFromAnswer } from '@delendai/core/cli';

import type { IQuestionPrompt } from '../../contracts/interfaces/init-offer.interface';
import { ask, askChoice, askConfirm } from './init-prompts.service';

type IPaid = IAccountClassification['billingMode'] | 'skip';

const PAYMENT_CHOICES: ReadonlyArray<{ label: string; value: IPaid }> = [
	{
		label: 'a subscription (a monthly plan you log in to)',
		value: 'subscription-included',
	},
	{
		label: 'a prepaid plan (tokens or prompts bought ahead)',
		value: 'prepaid-token-plan',
	},
	{ label: 'pay as you go (billed per use)', value: 'pay-as-you-go' },
	{ label: 'local (runs on this machine, no bill)', value: 'local' },
	{ label: 'skip it for now', value: 'skip' },
];

/** The three questions, asked on `rl`. */
export const accountPromptsOn = (rl: IQuestionPrompt) => ({
	ask: (offer: IProviderAccount) =>
		askConfirm(
			rl,
			`Add ${offer.accountId} (${offer.displayName ?? offer.vendor}; ${offer.credentialMode}, ${offer.billingMode}) to your own file for this project?`,
			false,
		),
	askAutomation: (offer: IProviderAccount) =>
		askConfirm(
			rl,
			`Let delendai use ${offer.accountId} for unattended work? A hop that may spend still asks you first`,
			false,
		),
	beforeClassifying: (count: number) =>
		askConfirm(
			rl,
			`${String(count)} more possible account(s) were found that delendai cannot classify on its own (providers a client reaches, keys in your environment, models your chats used). Go through them now? Each takes two short answers`,
			true,
		),
	classify: async (
		finding: IAccountFinding,
	): Promise<IAccountClassification | undefined> => {
		process.stderr.write(
			`\nFound ${finding.displayName}: ${finding.evidence}\n`,
		);
		const vendor = await ask(
			rl,
			'Who is it with? (any name; "skip" to leave it)',
			finding.vendorHint,
		);
		if (vendor.trim().length === 0 || vendor.trim() === 'skip')
			return undefined;
		const paid = await askChoice(
			rl,
			`How is ${vendor} paid?`,
			PAYMENT_CHOICES,
			'skip',
		);
		return paid === 'skip'
			? undefined
			: classificationFromAnswer(finding, vendor, paid);
	},
});
