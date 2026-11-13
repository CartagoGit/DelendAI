/**
 * account-registry.helper.ts — the rules that keep accounts apart.
 *
 * Written once and read by both the \`--check\` schema and the roster
 * plugins receive, so the diagnostic and the running server refuse the
 * same things:
 *
 *   - two accounts with one \`accountId\`;
 *   - two accounts logging in to one profile directory, which would make
 *     them one login under two names;
 *   - one quota group drawn from by two accounts, which would mix what
 *     each of them consumes;
 *   - a roster entry naming an account nobody declared.
 */
import type {
	IAccountRegistryIssue,
	IProviderAccount,
} from '../contracts/interfaces/provider-account.interface';

/** A profile directory as compared: separators unified, no trailing one. */
const profileKey = (dir: string): string =>
	dir.replaceAll('\\', '/').replace(/\/+$/u, '');

export const accountIssues = (
	accounts: readonly {
		readonly accountId: IProviderAccount['accountId'];
		readonly profileDir?: string | undefined;
		readonly quotaGroups: IProviderAccount['quotaGroups'];
	}[],
): IAccountRegistryIssue[] => {
	const issues: IAccountRegistryIssue[] = [];
	const ids = new Set<string>();
	const profiles = new Map<string, string>();
	const pools = new Map<string, string>();
	for (const [index, account] of accounts.entries()) {
		const refuse = (field: string, message: string) => {
			issues.push({ block: 'accounts', index, field, message });
		};
		// An account refused is not registered, so it never blames a
		// later one for a profile or a pool only it claimed.
		if (ids.has(account.accountId)) {
			refuse('accountId', `duplicate account id "${account.accountId}"`);
			continue;
		}
		const profile =
			account.profileDir === undefined
				? undefined
				: profileKey(account.profileDir);
		const profileHolder =
			profile === undefined ? undefined : profiles.get(profile);
		if (profileHolder !== undefined) {
			refuse(
				'profileDir',
				`account "${account.accountId}" shares profile directory "${account.profileDir}" with "${profileHolder}"`,
			);
			continue;
		}
		const taken = account.quotaGroups.find((group) => pools.has(group));
		if (taken !== undefined) {
			refuse(
				'quotaGroups',
				`quota group "${taken}" of account "${account.accountId}" already belongs to "${pools.get(taken)}"`,
			);
			continue;
		}
		ids.add(account.accountId);
		if (profile !== undefined) profiles.set(profile, account.accountId);
		for (const group of account.quotaGroups)
			pools.set(group, account.accountId);
	}
	return issues;
};

/** The roster entries that name an account the registry does not hold. */
export const unknownAccountIssues = (
	providers: readonly {
		readonly id: string;
		readonly accountId?: string | undefined;
	}[],
	accountIds: ReadonlySet<string>,
): IAccountRegistryIssue[] =>
	providers.flatMap((provider, index) =>
		provider.accountId === undefined || accountIds.has(provider.accountId)
			? []
			: [
					{
						block: 'providers' as const,
						index,
						field: 'accountId',
						message: `provider "${provider.id}" names undeclared account "${provider.accountId}"`,
					},
				],
	);
