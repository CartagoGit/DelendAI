/**
 * accounts.command.ts — `delendai accounts offer [--yes [--allow-automation]]`
 * , `delendai accounts automation <id> on|off` and
 * `delendai accounts consent --yes|--no`.
 *
 * The accounts this machine's clients are logged in with, offered one by
 * one; a yes goes to the person's own project file (never the committed
 * configuration), and a second question asks whether unattended work may
 * use it. A no is remembered. Without a terminal and without `--yes` the
 * offers are only listed. Nobody has to edit the file by hand.
 */
import {
	DEFAULT_CORE_PATHS,
	discoveryConsentPath,
	offerFoundAccounts,
	readModelCatalogue,
	recordDiscoveryConsent,
	runClientCommand,
	setAccountAutomation,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { offerMessagesFor } from '../contracts/constants/offer-messages.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';
import { saveLanguage } from '../lib/cli-language.service';
import {
	accountPromptsOn,
	askLanguage,
} from '../lib/init/account-prompts.service';
import {
	cardWidth,
	offerHeader,
	offerSummary,
} from '../lib/init/offer-card.service';
import { offerProgress } from '../lib/init/offer-progress.service';
import { isInteractive, openRl } from '../lib/init/init-prompts.service';

const USAGE =
	'accounts offer [--yes [--allow-automation]] [--no-catalogue] | accounts automation <account-id> on|off | accounts consent --yes|--no';

const offer = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const all = hasFlag(args, 'yes');
	const automated = all && hasFlag(args, 'allow-automation');
	const rl = !all && isInteractive() ? openRl() : undefined;
	// Nothing named a language and someone is there to answer: ask once,
	// in every language the offer speaks, and keep the answer.
	let lang = ctx.globals.lang;
	if (rl !== undefined && ctx.globals.langUnset === true) {
		lang = await askLanguage(rl);
		await saveLanguage(lang);
		process.stderr.write(
			`  ${offerMessagesFor(lang).languageSaved(lang)}\n`,
		);
	}
	const messages = offerMessagesFor(lang);
	const width = cardWidth(process.stderr.columns);
	const progress = offerProgress(process.stderr, messages);
	try {
		const prompts =
			rl === undefined
				? undefined
				: accountPromptsOn(rl, progress.stop, messages, width);
		process.stderr.write(`${offerHeader(messages, width)}\n`);
		const outcome = await offerFoundAccounts({
			workspace: ctx.cwd,
			onProgress: progress.step,
			onClient: progress.client,
			run: runClientCommand,
			// The public catalogue names any provider's keys and models;
			// `--no-catalogue` keeps the offer from reaching the network.
			...(hasFlag(args, 'no-catalogue')
				? {}
				: {
						loadCatalogue: (sources) =>
							readModelCatalogue({ sources }),
					}),
			ask: async (found, position) =>
				all
					? true
					: prompts === undefined
						? undefined
						: prompts.ask(found, position),
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
		progress.stop();
		if (prompts?.stopped() === true)
			process.stderr.write(`\n  ${messages.stopped}\n`);
		if (prompts === undefined || ctx.globals.json) return data(outcome);
		// A person who answered questions reads a summary, not the JSON.
		if (outcome.offered.length + outcome.unclassified.length === 0)
			process.stderr.write(`\n  ${messages.nothingFound}\n`);
		process.stderr.write(
			offerSummary(messages, {
				added: outcome.added,
				declined: outcome.declined,
				notAsked: outcome.unclassified.length,
				personalLayer: outcome.personalLayer,
			}),
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

/**
 * The answer to the discovery question, given in a terminal: a host that
 * never shows the question (it declines on its own) leaves no other way.
 */
const consent = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const yes = hasFlag(args, 'yes');
	if (yes === hasFlag(args, 'no')) {
		return { code: EXIT_CODE.USAGE, error: `usage: delendai ${USAGE}` };
	}
	const answer = yes ? 'granted' : 'declined';
	const path = discoveryConsentPath(
		ctx.cwd,
		ctx.globals.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
	);
	await recordDiscoveryConsent(path, answer, new Date());
	return data({ answer, recordedIn: path });
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
		if (args[0] === 'consent') return consent(args, ctx);
		return { code: EXIT_CODE.USAGE, error: `usage: delendai ${USAGE}` };
	},
};
