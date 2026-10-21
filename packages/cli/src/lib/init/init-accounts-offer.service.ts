/**
 * init-accounts-offer.service.ts — at the end of an interactive `init`,
 * the accounts this machine's clients are logged in with are offered once
 * (`delendai accounts offer` is the same flow, for later).
 */
import { offerFoundAccounts, runClientCommand } from '@delendai/core/cli';

import type { IInitOfferDeps } from '../../contracts/interfaces/init-offer.interface';
import { accountPromptsOn } from './account-prompts.service';
import { isInteractive, openRl } from './init-prompts.service';

const realDeps: IInitOfferDeps = {
	interactive: isInteractive,
	open: openRl,
	offer: offerFoundAccounts,
	report: (line) => {
		process.stderr.write(`${line}\n`);
	},
};

/** Offer the accounts found; a terminal-less init offers nothing. */
export const offerAccountsAfterInit = async (
	cwd: string,
	deps: IInitOfferDeps = realDeps,
): Promise<void> => {
	if (!deps.interactive()) return;
	const rl = deps.open();
	try {
		const prompts = accountPromptsOn(rl);
		const outcome = await deps.offer({
			workspace: cwd,
			run: runClientCommand,
			ask: prompts.ask,
			askAutomation: prompts.askAutomation,
			classify: prompts.classify,
			beforeClassifying: prompts.beforeClassifying,
		});
		if (outcome.added.length > 0)
			deps.report(
				`Accounts added to ${outcome.personalLayer}: ${outcome.added.join(', ')}. Change unattended use later with 'delendai accounts automation <id> on|off'.`,
			);
	} finally {
		rl.close();
	}
};
