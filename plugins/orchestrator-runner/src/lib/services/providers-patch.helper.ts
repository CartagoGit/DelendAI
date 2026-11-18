/**
 * providers-patch.helper.ts — the JSON Patch that copies what discovery
 * found into the confirmed config: providers, and the accounts their own
 * login answers describe.
 */
import type { IProviderCapabilities } from '@delendai/core/public';
import { knownClientOf } from '@delendai/core/contracts';

import type { IDiscoveredProvider, IJsonPatchOp } from '../bootstrap';

/**
 * The account a discovered CLI runs on, when its own login answer says how
 * it is logged in and paid and says it can work; `undefined` otherwise —
 * an account is never drafted from a guess. Off for unattended work until
 * the person turns it on.
 */
export const draftLoginAccount = (
	discovered: IDiscoveredProvider,
	workspaceRoot: string,
): Record<string, unknown> | undefined => {
	const client = knownClientOf(discovered.id, workspaceRoot);
	if (
		client === undefined ||
		discovered.login === undefined ||
		discovered.verdict !== 'usable'
	)
		return undefined;
	const accountId = `${discovered.id}-login`;
	return {
		accountId,
		vendor: client.vendor,
		displayName: client.label,
		credentialMode: discovered.login.credentialMode,
		billingMode: discovered.login.billingMode,
		quotaGroups: [accountId],
		permittedAutomation: false,
	};
};

/**
 * Build the draft `IProviderCapabilities` entry for a discovered CLI. The
 * concrete `modelId`/`costTier`/capabilities are placeholders the user
 * refines — the wizard only knows the CLI exists, not which model it should
 * front. Kept a well-typed core contract shape so the patch value is valid.
 */
export const draftProviderEntry = (
	discovered: IDiscoveredProvider,
): IProviderCapabilities => ({
	id: discovered.id,
	kind: 'cli',
	invoke: { kind: 'cli', command: discovered.id },
	modelId: 'PLEASE-SET-MODEL-ID',
	contextWindow: 0,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

/**
 * Build the RFC 6902 JSON Patch (CRITICAL I13) that copies newly-discovered
 * providers into `delendai.config.json#providers` on user confirm.
 *
 * - If the confirmed config has no `/providers` array yet, the first op
 *   creates it (`{op:'add', path:'/providers', value:[]}`).
 * - Each discovered provider whose `id` is NOT already confirmed is appended
 *   (`{op:'add', path:'/providers/-', value:<entry>}`). Existing ids are
 *   left untouched — re-running the wizard is non-destructive (§3).
 *
 * - Given the confirmed `accounts` (or `null` when there are none yet), each
 *   detected CLI whose login answer says how it is logged in and paid also
 *   gets its account under `/accounts`, and its provider entry names it:
 *   a multi-account roster patched `/providers` only, and every provider
 *   ran on no account.
 *
 * The patch is RETURNED to the caller; the wizard never applies it itself.
 */
export const buildProvidersPatch = (
	confirmedProviders: readonly { readonly id?: unknown }[] | null,
	detected: readonly IDiscoveredProvider[],
	confirmedAccounts?: readonly { readonly accountId?: unknown }[] | null,
	/** The project whose declared clients name the accounts' vendors. */
	workspaceRoot?: string,
): readonly IJsonPatchOp[] => {
	const ops: IJsonPatchOp[] = [];
	const accountOps: IJsonPatchOp[] = [];
	const existingAccounts = new Set(
		(confirmedAccounts ?? [])
			.map((entry) => entry.accountId)
			.filter((id): id is string => typeof id === 'string'),
	);
	if (confirmedProviders === null) {
		ops.push({ op: 'add', path: '/providers', value: [] });
	}
	const existingIds = new Set(
		(confirmedProviders ?? [])
			.map((entry) => entry.id)
			.filter((id): id is string => typeof id === 'string'),
	);
	for (const provider of detected) {
		if (existingIds.has(provider.id)) continue;
		const account =
			confirmedAccounts === undefined || workspaceRoot === undefined
				? undefined
				: draftLoginAccount(provider, workspaceRoot);
		const accountId =
			typeof account?.accountId === 'string'
				? account.accountId
				: undefined;
		if (
			account !== undefined &&
			accountId !== undefined &&
			!existingAccounts.has(accountId)
		) {
			accountOps.push({ op: 'add', path: '/accounts/-', value: account });
			existingAccounts.add(accountId);
		}
		ops.push({
			op: 'add',
			path: '/providers/-',
			value: {
				...draftProviderEntry(provider),
				...(accountId === undefined ? {} : { accountId }),
			},
		});
	}
	if (accountOps.length === 0) return ops;
	return [
		...(confirmedAccounts === null
			? [{ op: 'add' as const, path: '/accounts', value: [] }]
			: []),
		...accountOps,
		...ops,
	];
};
