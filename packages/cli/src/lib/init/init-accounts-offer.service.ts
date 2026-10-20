/**
 * init-accounts-offer.service.ts — at the end of an interactive `init`,
 * the accounts this machine's clients are logged in with are offered once
 * (`delendai accounts offer` is the same flow, for later).
 */
import { offerFoundAccounts, runClientCommand } from '@delendai/core/cli';

import type { IInitOfferDeps } from '../../contracts/interfaces/init-offer.interface';
import { askConfirm, isInteractive, openRl } from './init-prompts.service';

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
		const outcome = await deps.offer({
			workspace: cwd,
			run: runClientCommand,
			ask: (offer) =>
				askConfirm(
					rl,
					`Found ${offer.displayName ?? offer.accountId} (${offer.credentialMode}, ${offer.billingMode}). Add it to your own file for this project?`,
					false,
				),
			askAutomation: (offer) =>
				askConfirm(
					rl,
					`Let delendai use ${offer.accountId} for unattended work? A hop that may spend still asks you first`,
					false,
				),
		});
		if (outcome.added.length > 0)
			deps.report(
				`Accounts added to ${outcome.personalLayer}: ${outcome.added.join(', ')}. Change unattended use later with 'delendai accounts automation <id> on|off'.`,
			);
	} finally {
		rl.close();
	}
};
