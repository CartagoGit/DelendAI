/**
 * account-offers.service.ts — the findings that become offers, and the
 * ones a person has to classify first.
 *
 * An offer is a draft: it runs no unattended work until the person turns
 * it on. Its credential and billing mode come from the source, or from
 * the person's answer, never from a guess: a guessed billing mode is how a
 * paid key gets spent as if it were a subscription. A finding nobody has
 * classified is not dropped; it is asked.
 */
import type {
	IAccountClassification,
	IAccountFinding,
} from '../contracts/interfaces/account-finding.interface';
import type { IKnownAccounts } from '../contracts/interfaces/account-offer.interface';
import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';
import { toKebabCase } from '../shared/string-normalize';

/** The draft account a classified finding offers. */
export const offerFor = (
	finding: IAccountFinding,
	classification: IAccountClassification,
): IProviderAccount => ({
	accountId: finding.accountId,
	vendor: toKebabCase(classification.vendor),
	displayName: finding.displayName,
	credentialMode: classification.credentialMode,
	billingMode: classification.billingMode,
	...(finding.credentialEnv === undefined
		? {}
		: { credentialEnv: finding.credentialEnv }),
	quotaGroups: [finding.accountId],
	permittedAutomation: false,
});

/** Whether `account` repeats something known or declined. */
export const alreadyKnown = (
	account: IProviderAccount,
	known: IKnownAccounts,
): boolean =>
	known.declined.includes(account.accountId) ||
	known.accounts.some(
		(each) =>
			each.accountId === account.accountId ||
			(account.credentialEnv !== undefined &&
				each.credentialEnv === account.credentialEnv) ||
			(each.vendor === account.vendor &&
				each.credentialMode === account.credentialMode),
	);

/**
 * Split findings into offers (classified by their source or by a learned
 * answer) and the ones still to be classified, without repeating a known
 * account, a declined one, or an earlier finding's account id.
 */
export const accountOffers = (
	findings: readonly IAccountFinding[],
	known: IKnownAccounts,
	learned: Readonly<Record<string, IAccountClassification>> = {},
): {
	readonly offers: readonly IProviderAccount[];
	readonly unclassified: readonly IAccountFinding[];
} => {
	const offers: IProviderAccount[] = [];
	const unclassified: IAccountFinding[] = [];
	const seen = new Set<string>();
	for (const finding of findings) {
		if (seen.has(finding.accountId)) continue;
		seen.add(finding.accountId);
		if (known.declined.includes(finding.accountId)) continue;
		const classification = finding.classification ?? learned[finding.key];
		if (classification === undefined) {
			if (
				!known.accounts.some(
					(each) => each.accountId === finding.accountId,
				)
			)
				unclassified.push(finding);
			continue;
		}
		const offer = offerFor(finding, classification);
		if (!alreadyKnown(offer, known)) offers.push(offer);
	}
	return { offers, unclassified };
};

/**
 * A person's answer as a classification: the vendor in their words, and
 * how it is paid. The credential mode follows: a key in a variable is a
 * plan token when a plan pays for it and an own key otherwise; without a
 * key, a subscription is a login, a prepaid plan a plan token, and local
 * needs none.
 */
export const classificationFromAnswer = (
	finding: Pick<IAccountFinding, 'credentialEnv' | 'hostHeld'>,
	vendor: string,
	billingMode: IAccountClassification['billingMode'],
): IAccountClassification => {
	// However it is paid, a key an editor keeps is the editor's to use.
	if (finding.hostHeld === true)
		return {
			vendor: toKebabCase(vendor),
			credentialMode: 'host-held',
			billingMode,
		};
	const planPaid =
		billingMode === 'subscription-included' ||
		billingMode === 'prepaid-token-plan';
	const credentialMode: IAccountClassification['credentialMode'] =
		billingMode === 'local'
			? 'local-none'
			: finding.credentialEnv !== undefined
				? planPaid
					? 'provider-plan-token'
					: 'byok-api-key'
				: billingMode === 'subscription-included'
					? 'official-subscription-login'
					: billingMode === 'prepaid-token-plan'
						? 'provider-plan-token'
						: 'byok-api-key';
	return { vendor: toKebabCase(vendor), credentialMode, billingMode };
};
