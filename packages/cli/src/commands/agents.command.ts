/**
 * agents.command.ts — `delendai agents list [--all]`, `agents add`,
 * `agents install <id> [--yes]`, `agents show <id>` and
 * `agents answer <name> --yes|--no`.
 *
 * The agents this project can reach: from the public ACP registry, from
 * the project's and the person's declarations, and from what this machine
 * shows. `add` declares one in the person's own file (nobody edits it by
 * hand); `install` fetches a registry agent's binary after a yes and
 * checks its sha256; `show` greets an ACP agent and prints what it says
 * it is, which costs nothing.
 */
import {
	answerAgentCandidate,
	declareAgent,
	installAgent,
	introduceAgent,
	listAgents,
	writeAgentUsagePage,
	writeProviderUsagePage,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';
import {
	askConfirm,
	isInteractive,
	openRl,
} from '../lib/init/init-prompts.service';

const USAGE_ADD =
	'agents add --id=<id> --kind=acp|cli|exec|http|file|mcp [--command=<c>] [--args=a,b] [--path=<p>] [--url=<u>] [--mcp-server=<s>] [--name=<n>]';

const USAGE_ANSWER = 'agents answer <name> --yes|--no';

const usageError = (form: string): ICliCommandResult => ({
	code: EXIT_CODE.USAGE,
	error: `usage: delendai ${form}`,
});

/** `--name=value` from the args. */
const flag = (args: readonly string[], name: string): string | undefined =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const failed = (error: unknown): ICliCommandResult => ({
	code: EXIT_CODE.NOT_FOUND,
	error: error instanceof Error ? error.message : String(error),
});

const list = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const { agents, candidates } = await listAgents({
		workspace: ctx.cwd,
		all: hasFlag(args, 'all'),
	});
	if (ctx.globals.json) return data({ agents, candidates });
	const lines = agents.map((agent) => {
		const where = agent.found.map((each) => each.evidence).join('; ');
		return `${agent.id.padEnd(22)} ${agent.kind.padEnd(5)} ${agent.origin.padEnd(9)} ${agent.launch === undefined ? '-' : 'can start'}${where === '' ? '' : `  (${where})`}`;
	});
	process.stdout.write(
		`${[`${agents.length} agent(s)`, ...lines].join('\n')}\n`,
	);
	await offerCandidates(
		candidates.map((each) => each.name),
		ctx,
	);
	return { ...data({ agents, candidates }), suppressDefaultPrint: true };
};

/**
 * Each executable that looks like an agent is offered once: asked here
 * when someone can answer, otherwise named with the command that answers
 * it. The answer is kept, so it is never asked again.
 */
const offerCandidates = async (
	names: readonly string[],
	ctx: ICliCommandContext,
): Promise<void> => {
	if (names.length === 0) return;
	if (!isInteractive()) {
		process.stdout.write(
			`${names.length} possible agent(s) to answer: ${names
				.map((name) => `delendai agents answer ${name} --yes|--no`)
				.join(', ')}\n`,
		);
		return;
	}
	const rl = openRl();
	try {
		for (const name of names) {
			const accept = await askConfirm(
				rl,
				`Use ${name} as an agent of this project?`,
				false,
			);
			await answerAgentCandidate({ workspace: ctx.cwd, name, accept });
		}
	} finally {
		rl.close();
	}
};

/** `agents answer <name> --yes|--no`: keep the answer about an offered executable. */
const answer = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const name = args.find((arg) => !arg.startsWith('--'));
	const accept = hasFlag(args, 'yes');
	if (name === undefined || accept === hasFlag(args, 'no'))
		return usageError(USAGE_ANSWER);
	try {
		return data({
			name,
			accepted: accept,
			...(await answerAgentCandidate({
				workspace: ctx.cwd,
				name,
				accept,
			})),
		});
	} catch (error) {
		return failed(error);
	}
};

const add = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const id = flag(args, 'id');
	const kind = flag(args, 'kind');
	if (id === undefined || kind === undefined) return usageError(USAGE_ADD);
	const fields = {
		id,
		kind,
		name: flag(args, 'name'),
		command: flag(args, 'command'),
		args: flag(args, 'args')?.split(',').filter(Boolean),
		path: flag(args, 'path'),
		url: flag(args, 'url'),
		mcpServer: flag(args, 'mcp-server'),
	};
	const agent = Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	);
	try {
		return data(await declareAgent({ workspace: ctx.cwd, agent }));
	} catch (error) {
		return { code: EXIT_CODE.USAGE, error: failed(error).error };
	}
};

const install = async (args: readonly string[]): Promise<ICliCommandResult> => {
	const id = args[1];
	if (id === undefined) return usageError('agents install <id> [--yes]');
	if (!hasFlag(args, 'yes')) {
		if (!isInteractive())
			return {
				code: EXIT_CODE.USAGE,
				error: `pass --yes to install ${id} without a terminal`,
			};
		const rl = openRl();
		try {
			if (
				!(await askConfirm(
					rl,
					`Download and install ${id} from the archive the registry names?`,
					false,
				))
			)
				return data({ id, installed: false });
		} finally {
			rl.close();
		}
	}
	try {
		return data(await installAgent({ id }));
	} catch (error) {
		return failed(error);
	}
};

const show = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const id = args[1];
	if (id === undefined) return usageError('agents show <id> [--write]');
	const { agents, catalogue } = await listAgents({
		workspace: ctx.cwd,
		all: true,
	});
	const agent = agents.find((each) => each.id === id);
	if (agent === undefined) {
		// A model provider says about itself what its catalogue entry says.
		const provider = catalogue?.providers.find((each) => each.id === id);
		if (provider === undefined)
			return failed(new Error(`no agent or model provider ${id}`));
		const page = hasFlag(args, 'write')
			? await writeProviderUsagePage({
					workspace: ctx.cwd,
					provider,
					catalogueDate: catalogue?.fetchedAt,
				})
			: undefined;
		return data({ id, provider, ...(page === undefined ? {} : { page }) });
	}
	if (agent.launch === undefined)
		return data({
			agent,
			introduction: null,
			note: 'it cannot start here over ACP',
		});
	try {
		const introduction = await introduceAgent(agent.launch, ctx.cwd);
		// --write keeps what it said in the agent's usage page.
		const page = hasFlag(args, 'write')
			? await writeAgentUsagePage({
					workspace: ctx.cwd,
					agent,
					introduction,
				})
			: undefined;
		return data({
			id,
			introduction,
			...(page === undefined ? {} : { page }),
		});
	} catch (error) {
		return failed(error);
	}
};

/** One command per subcommand, beside the selector's `agents status|recommend|record|run`. */
export const agentsListCommand: ICliCommand = {
	name: 'agents list',
	offline: true,
	summary:
		'List the AI agents this project can use: registry, declared and found on this machine.',
	usage: 'agents list [--all]',
	run: list,
};

export const agentsAddCommand: ICliCommand = {
	name: 'agents add',
	offline: true,
	summary: 'Declare an AI agent in your own file for this project.',
	usage: USAGE_ADD,
	run: add,
};

export const agentsInstallCommand: ICliCommand = {
	name: 'agents install',
	offline: true,
	summary:
		"Install a registry agent's binary after a yes, checked by its sha256.",
	usage: 'agents install <id> [--yes]',
	run: (args) => install(['install', ...args]),
};

export const agentsShowCommand: ICliCommand = {
	name: 'agents show',
	offline: true,
	summary:
		"Greet an ACP agent, or read a model provider's catalogue entry, and show what it says it is; nothing is spent.",
	usage: 'agents show <id> [--write]',
	run: (args, ctx) => show(['show', ...args], ctx),
};

export const agentsAnswerCommand: ICliCommand = {
	name: 'agents answer',
	offline: true,
	summary:
		'Keep your answer about an executable offered as an agent, so it is not asked again.',
	usage: USAGE_ANSWER,
	run: answer,
};
