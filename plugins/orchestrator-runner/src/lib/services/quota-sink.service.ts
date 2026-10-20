/**
 * quota-sink.service.ts — where what a hop learned about its quota is
 * written: the groups of the account its provider runs on.
 */
import type { IProviderAccount } from '@delendai/core/contracts';

import { groupWindowsOf, recordGroupObservation } from '../quota';
import type { QuotaSink } from '../subprocess/api';

/**
 * Where a provider's quota samples go: the groups of the account it runs
 * on. A provider on no account, or on one without groups, records nothing.
 * Never throws into the hop: a sample that cannot be written is lost, and
 * the next hop is judged on what was.
 */
export const quotaSinkFor = (input: {
	readonly providers: readonly {
		readonly id: string;
		readonly accountId?: string | undefined;
	}[];
	readonly accounts: readonly IProviderAccount[];
	readonly quotasPath: string;
}): QuotaSink => {
	const groupsOf = new Map(
		input.providers.flatMap((provider) => {
			const account = input.accounts.find(
				(each) => each.accountId === provider.accountId,
			);
			return account === undefined
				? []
				: [[provider.id, account.quotaGroups] as const];
		}),
	);
	return (sample) => {
		const groups = groupsOf.get(sample.providerId) ?? [];
		void recordGroupObservation(
			input.quotasPath,
			groups,
			groupWindowsOf(sample),
		).catch(() => undefined);
	};
};
