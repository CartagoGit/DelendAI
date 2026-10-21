/**
 * accounts.command.ts — `delendai accounts offer [--yes [--allow-automation]]`
 * and `delendai accounts automation <id> on|off`.
 *
 * The accounts this machine's clients are logged in with, offered one by
 * one; a yes goes to the person's own project file (never the committed
 * configuration), and a second question asks whether unattended work may
 * use it. A no is remembered. Without a terminal and without `--yes` the
 * offers are only listed. Nobody has to edit the file by hand.
 */
import {
	offerFoundAccounts,
	runClientCommand,
	setAccountAutomation,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';
import { accountPromptsOn } from '../lib/init/account-prompts.service';
import { offerProgress } from '../lib/init/offer-progress.service';
import { isInteractive, openRl } from '../lib/init/init-prompts.service';

const USAGE =
	'accounts offer [--yes [--allow-automation]] | accounts automation <account-id> on|off';

const offer = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const all = hasFlag(args, 'yes');
	const automated = all && hasFlag(args, 'allow-automation');
	const rl = !all && isInteractive() ? openRl() : undefined;
	const progress = offerProgress(process.stderr);
	try {
		const prompts =
			rl === undefined ? undefined : accountPromptsOn(rl, progress.stop);
		process.stderr.write('Looking for the accounts on this machine…\n');
		const outcome = await offerFoundAccounts({
			workspace: ctx.cwd,
			onProgress: progress.step,
			onClient: progress.client,
			run: runClientCommand,
			ask: async (found) =>
				all
					? true
					: prompts === undefined
						? undefined
						: prompts.ask(found),
			askAutomation: async (found) =>
				all
					? automated
					: prompts === undefined
						? false
						: prompts.askAutomation(found),
			...(prompts === undefined
				? {}
				: {
						classify: prompts.classify,
						beforeClassifying: prompts.beforeClassifying,
					}),
		});
		if (prompts?.stopped() === true)
			process.stderr.write(
				`Stopped. Kept: ${outcome.added.length} added, ${outcome.declined.length} declined; the rest was not asked and is offered next time.\n`,
			);
		if (prompts === undefined || ctx.globals.json) return data(outcome);
		// A person who answered questions reads a summary, not the JSON.
		process.stderr.write(
			[
				`Added to ${outcome.personalLayer}: ${outcome.added.join(', ') || 'none'}`,
				`Declined: ${outcome.declined.join(', ') || 'none'}`,
				...(outcome.unclassified.length === 0
					? []
					: [
							`Not asked yet: ${String(outcome.unclassified.length)} (run it again to go through them)`,
						]),
				"Change unattended use with 'delendai accounts automation <id> on|off'.",
				'',
			].join('\n'),
		);
		return { ...data(outcome), suppressDefaultPrint: true };
	} finally {
		progress.stop();
		rl?.close();
	}
};

const automation = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const [accountId, state] = [args[1], args[2]];
	if (accountId === undefined || (state !== 'on' && state !== 'off')) {
		return { code: EXIT_CODE.USAGE, error: `usage: delendai ${USAGE}` };
	}
	try {
		return data(
			await setAccountAutomation({
				workspace: ctx.cwd,
				accountId,
				on: state === 'on',
			}),
		);
	} catch (error) {
		return {
			code: EXIT_CODE.NOT_FOUND,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

export const accountsCommand: ICliCommand = {
	name: 'accounts',
	offline: true,
	summary:
		"Offer the accounts this machine's AI clients are logged in with, for your own project file.",
	usage: USAGE,
	run: async (args, ctx) => {
		if (args[0] === 'offer') return offer(args, ctx);
		if (args[0] === 'automation') return automation(args, ctx);
		return { code: EXIT_CODE.USAGE, error: `usage: delendai ${USAGE}` };
	},
};
