/**
 * accounts.command.ts — `delendai accounts offer [--yes]`.
 *
 * The accounts this machine's clients are logged in with, offered one by
 * one; a yes goes to the person's own project file (never the committed
 * configuration) with unattended work off, a no is remembered. Without a
 * terminal and without `--yes` the offers are only listed.
 */
import { offerFoundAccounts, runClientCommand } from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';
import {
	askConfirm,
	isInteractive,
	openRl,
} from '../lib/init/init-prompts.service';

export const accountsCommand: ICliCommand = {
	name: 'accounts',
	summary:
		"Offer the accounts this machine's AI clients are logged in with, for your own project file.",
	usage: 'accounts offer [--yes]',
	run: async (args, ctx) => {
		if (args[0] !== 'offer') {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: delendai accounts offer [--yes]',
			};
		}
		const all = hasFlag(args, 'yes');
		const rl = !all && isInteractive() ? openRl() : undefined;
		try {
			const outcome = await offerFoundAccounts({
				workspace: ctx.cwd,
				run: runClientCommand,
				ask: async (offer) =>
					all
						? true
						: rl === undefined
							? undefined
							: askConfirm(
									rl,
									`Add ${offer.accountId} (${offer.displayName ?? offer.vendor}; ${offer.credentialMode}, ${offer.billingMode}) to your own file? Unattended work stays off`,
									false,
								),
			});
			return data(outcome);
		} finally {
			rl?.close();
		}
	},
};
