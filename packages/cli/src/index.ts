#!/usr/bin/env bun
import { runCli as runServerCli } from '@mcp-vertex/core/public';

import { registerAllCommands } from './commands/registry';
import { CLI_VERSION } from './contracts/constants/version.constant';
import { EXIT_CODE } from './contracts/constants/exit-code.constant';
import type { ICliCommand } from './contracts/interfaces/cli-command.interface';
import { renderHelp } from './lib/help.service';
import { parseCliInvocation } from './lib/parser.service';
import { createStdioContext } from './lib/stdio-context.factory';
import { createNoopContext } from './lib/noop-context.factory';
import { formatJson } from './lib/stable-json.service';

const commandMatches = (
	command: ICliCommand,
	path: readonly string[],
): boolean =>
	command.name.split(' ').every((part, index) => path[index] === part);

const findCommand = (
	commands: readonly ICliCommand[],
	path: readonly string[],
): ICliCommand | undefined =>
	commands
		.filter((command) => commandMatches(command, path))
		.sort((a, b) => b.name.split(' ').length - a.name.split(' ').length)[0];

const consumedPathParts = (command: ICliCommand): number =>
	command.name.split(' ').length;

const twoPartPrefixes = (
	commands: readonly ICliCommand[],
): ReadonlySet<string> =>
	new Set(
		commands
			.filter((command) => command.name.includes(' '))
			.map((command) => command.name.split(' ')[0] ?? ''),
	);

export const runHumanCli = async (
	argv: readonly string[],
	cwd = process.cwd(),
): Promise<number> => {
	const commands = await registerAllCommands();
	const parsed = parseCliInvocation(argv, cwd, twoPartPrefixes(commands));
	if (parsed.version) {
		process.stdout.write(`${CLI_VERSION}\n`);
		return EXIT_CODE.OK;
	}
	if (parsed.help) {
		process.stdout.write(renderHelp(commands, parsed.globals.lang));
		return EXIT_CODE.OK;
	}

	const command = findCommand(commands, parsed.commandPath);
	if (command === undefined) {
		process.stderr.write(
			`Unknown command: ${parsed.commandPath.join(' ')}\n`,
		);
		process.stderr.write('Run `mcpv --help`.\n');
		return EXIT_CODE.USAGE;
	}

	const extraPlugins = command.name.startsWith('search')
		? ['search']
		: command.name.startsWith('docs ')
			? ['docs']
			: [];
	// `init` (f00084) and `init:default` (f00103) are local-bootstrap
	// commands — they write files to the workspace and never call back
	// into the MCP server. They run with a noop context to avoid
	// spawning an stdio server for what is essentially a copy-paste
	// pipeline.
	const isOffline =
		command.name === 'init' || command.name === 'init:default';
	let ctx: Awaited<ReturnType<typeof createStdioContext>> | undefined;
	try {
		ctx = isOffline
			? createNoopContext(cwd, parsed.globals)
			: await createStdioContext(cwd, parsed.globals, extraPlugins);
		const result = await command.run(
			[
				...parsed.commandPath.slice(consumedPathParts(command)),
				...parsed.commandArgs,
			],
			ctx,
		);
		if (result.error !== undefined)
			process.stderr.write(`${result.error}\n`);
		if (result.data !== undefined) {
			// Stdout policy (f00103 follow-up + the operator's report):
			//   - `--json` (or `--format=json`)  → structured envelope
			//     to stdout (pipe-safe, machine-readable).
			//   - everything else                → nothing on stdout.
			//     The command is expected to print its own
			//     human-facing recap to stderr (e.g. `init` writes
			//     `printInitHumanSummary` from `runInitWithAnswers`).
			//     The previous behaviour (`asScalarText(result.data)`)
			//     duplicated the recap with a full JSON dump on stdout
			//     — that is the bug the operator reported for `init`
			//     and `init:default` after a successful bootstrap.
			//
			// Note: `result.text` below still writes to stdout because
			// some commands (`--version`, `--help`, simple scalar
			// commands) return their output via `result.text` rather
			// than `result.data`. The runner policy is "if the
			// command handed us structured data, only surface it on
			// stdout when JSON mode is explicit". Plain-text commands
			// are unaffected.
			const emitStructured =
				parsed.globals.json || parsed.globals.format === 'json';
			if (emitStructured) {
				process.stdout.write(formatJson(result.data));
			}
		} else if (result.text !== undefined) {
			process.stdout.write(result.text);
		}
		return result.code;
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? Number((error as { code: unknown }).code)
				: EXIT_CODE.RUNTIME;
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		return Number.isFinite(code) ? code : EXIT_CODE.RUNTIME;
	} finally {
		await ctx?.close();
	}
};

if (import.meta.main) {
	const argv = process.argv.slice(2);
	if (argv[0] === '__serve') {
		void runServerCli(argv.slice(1), process.cwd());
	} else {
		const code = await runHumanCli(argv, process.cwd());
		process.exitCode = code;
	}
}
