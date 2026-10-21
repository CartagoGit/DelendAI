/**
 * agents.command.ts — `delendai agents list [--all]`, `agents add`,
 * `agents install <id> [--yes]` and `agents show <id>`.
 *
 * The agents this project can reach: from the public ACP registry, from
 * the project's and the person's declarations, and from what this machine
 * shows. `add` declares one in the person's own file (nobody edits it by
 * hand); `install` fetches a registry agent's binary after a yes and
 * checks its sha256; `show` greets an ACP agent and prints what it says
 * it is, which costs nothing.
 */
import {
	declareAgent,
	installAgent,
	introduceAgent,
	listAgents,
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

const usage = (form: string): ICliCommandResult => ({
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
	const { agents } = await listAgents({
		workspace: ctx.cwd,
		all: hasFlag(args, 'all'),
	});
	if (ctx.globals.json) return data({ agents });
	const lines = agents.map((agent) => {
		const where = agent.found.map((each) => each.evidence).join('; ');
		return `${agent.id.padEnd(22)} ${agent.kind.padEnd(5)} ${agent.origin.padEnd(9)} ${agent.launch === undefined ? '-' : 'can start'}${where === '' ? '' : `  (${where})`}`;
	});
	process.stdout.write(
		`${[`${agents.length} agent(s)`, ...lines].join('\n')}\n`,
	);
	return { ...data({ agents }), suppressDefaultPrint: true };
};

const add = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const id = flag(args, 'id');
	const kind = flag(args, 'kind');
	if (id === undefined || kind === undefined) return usage(USAGE_ADD);
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
	if (id === undefined) return usage('agents install <id> [--yes]');
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
	if (id === undefined) return usage('agents show <id>');
	const { agents } = await listAgents({ workspace: ctx.cwd, all: true });
	const agent = agents.find((each) => each.id === id);
	if (agent === undefined) return failed(new Error(`no agent ${id}`));
	if (agent.launch === undefined)
		return data({
			agent,
			introduction: null,
			note: 'it cannot start here over ACP',
		});
	try {
		return data({
			id,
			introduction: await introduceAgent(agent.launch, ctx.cwd),
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
		'Greet an ACP agent and show what it says it is; nothing is spent.',
	usage: 'agents show <id>',
	run: (args, ctx) => show(['show', ...args], ctx),
};
