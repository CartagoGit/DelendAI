/**
 * account-status.service.ts — what the registry, the quota ledger and the
 * invocation journal say about each account, in one answer.
 *
 * Nothing here is a secret: an account names the variable that holds its
 * credential and whether its client is isolated, never a value or a path
 * into a login. A pool whose ledger cannot be read says `null`, not 0.
 */
import type { IProviderAccount } from '@delendai/core/contracts';
import type { IProviderCapabilities } from '@delendai/core/public';

import type { IAccountStatus } from '../contracts/interfaces/account-status.interface';
import { readJournal } from './invocation-journal.service';
import { heldByGroup } from './quota-reservation.service';

export const accountStatuses = async (input: {
	readonly accounts: readonly IProviderAccount[];
	readonly ledgerPath: string;
	readonly journalPath: string;
	readonly now?: number;
}): Promise<IAccountStatus[]> => {
	const held = await heldByGroup(input.ledgerPath, input.now);
	const latest = new Map<string, IAccountStatus['lastInvocation']>();
	for (const entry of await readJournal(input.journalPath))
		if (entry.accountId !== undefined)
			latest.set(entry.accountId, {
				state: entry.state,
				at: entry.at,
				providerId: entry.providerId,
			});
	return input.accounts.map((account) => {
		const last = latest.get(account.accountId);
		return {
			accountId: account.accountId,
			vendor: account.vendor,
			...(account.displayName === undefined
				? {}
				: { displayName: account.displayName }),
			credentialMode: account.credentialMode,
			billingMode: account.billingMode,
			...(account.credentialEnv === undefined
				? {}
				: { credentialEnv: account.credentialEnv }),
			isolated: account.profileDir !== undefined,
			permittedAutomation: account.permittedAutomation,
			quotaGroups: account.quotaGroups.map((group) => ({
				group,
				held: held === undefined ? null : (held.get(group) ?? 0),
			})),
			...(last === undefined ? {} : { lastInvocation: last }),
		};
	});
};

/**
 * The CLI roster entries that run with the server's whole environment:
 * no account, and no `invoke.env` naming what they need. Isolating them
 * outright could take a key a provider reads from the environment, so
 * they are listed instead, for their owner to name an account or their
 * variables.
 */
export const inheritingEntries = (
	providers: readonly IProviderCapabilities[],
): { readonly providerId: string; readonly command: string }[] =>
	providers.flatMap((provider) =>
		provider.invoke.kind === 'cli' &&
		provider.accountId === undefined &&
		provider.invoke.env === undefined
			? [{ providerId: provider.id, command: provider.invoke.command }]
			: [],
	);
