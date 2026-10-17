/**
 * accounts.tool.ts — `<prefix>_accounts`.
 *
 * The accounts the roster runs on, as the registry, the quota ledger and
 * the invocation journal know them: modes, isolation, whether unattended
 * work may use each, the invocations holding each pool now and the last
 * hop on each. Never a secret. Read-only (no effects).
 */
import { toolJson } from '@delendai/core/public';
import type {
	IProviderAccount,
	IToolRegistration,
} from '@delendai/core/contracts';
import z from 'zod';

import { AccountsOutputSchema } from '../schemas';
import { accountStatuses } from '../services/account-status.service';

export interface IAccountsToolOptions {
	readonly namespacePrefix: string;
	readonly accounts: readonly IProviderAccount[];
	readonly ledgerPath: string;
	readonly journalPath: string;
}

export const buildAccountsRegistration = (
	options: IAccountsToolOptions,
): IToolRegistration => ({
	id: 'accounts',
	tags: ['orchestrator-runner', 'lazy', 'quota'],
	summary:
		'List the accounts the roster runs on: modes, isolation, pools held and the last hop.',
	descriptionKey: 'delendai_orchestrator-runner_accounts',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_accounts`,
			{
				description:
					'List the accounts declared in delendai.config.json#accounts: credential and billing mode, whether the client runs in an isolated profile, whether unattended work may use it, each quota group with the invocations holding it now (null when the ledger is unreadable) and the last hop the journal records. Never a secret. Read-only.',
				inputSchema: z.object({}),
				outputSchema: AccountsOutputSchema,
			},
			async () =>
				toolJson({
					accounts: await accountStatuses({
						accounts: options.accounts,
						ledgerPath: options.ledgerPath,
						journalPath: options.journalPath,
					}),
				}),
		);
	},
});
