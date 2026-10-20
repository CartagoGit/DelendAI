/**
 * account-offers.service.ts — the accounts a machine's logged-in clients
 * suggest, offered to the person and never declared for them.
 *
 * An offer is a draft: its credential and billing mode come from what the
 * client's own status answer says (`loginKinds`), it runs no unattended
 * work until the person turns `permittedAutomation` on, and a client whose
 * answer says neither is not offered at all: a guessed billing mode is how
 * a paid key gets spent as if it were a subscription.
 */
import type { IClientDiscovery } from '../contracts/interfaces/known-client.interface';
import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';

/** The id an offered account gets: its vendor and client, kebab-case. */
export const offeredAccountId = (discovery: IClientDiscovery): string =>
	`${discovery.client.vendor}-${discovery.client.command}`
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-|-$/gu, '');

/**
 * The accounts to offer: one per usable client whose login says how it
 * bills, minus any the person already declared (by id, or the same vendor
 * and credential mode) or already declined.
 */
export const accountOffers = (
	discoveries: readonly IClientDiscovery[],
	known: {
		readonly accounts: readonly Pick<
			IProviderAccount,
			'accountId' | 'vendor' | 'credentialMode'
		>[];
		readonly declined: readonly string[];
	},
): readonly IProviderAccount[] =>
	discoveries.flatMap((discovery) => {
		const login = discovery.login;
		if (discovery.verdict !== 'usable' || login === undefined) return [];
		const accountId = offeredAccountId(discovery);
		const taken =
			known.declined.includes(accountId) ||
			known.accounts.some(
				(account) =>
					account.accountId === accountId ||
					(account.vendor === discovery.client.vendor &&
						account.credentialMode === login.credentialMode),
			);
		if (taken) return [];
		return [
			{
				accountId,
				vendor: discovery.client.vendor,
				displayName: `${discovery.client.label}, as logged in on this machine`,
				credentialMode: login.credentialMode,
				billingMode: login.billingMode,
				quotaGroups: [accountId],
				permittedAutomation: false,
			},
		];
	});
