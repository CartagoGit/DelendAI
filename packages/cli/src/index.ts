#!/usr/bin/env bun
import { runCli as runServerCli } from '@mcp-vertex/core/public';

import { registerAllCommands } from './commands/registry';
import { CLI_VERSION } from './contracts/constants/version.constant';
import { EXIT_CODE } from './contracts/constants/exit-code.constant';
import type { ICliCommand } from './contracts/interfaces/cli-command.interface';
import { renderHelp } from './lib/help';
import { parseCliInvocation } from './lib/parser';
import { createStdioContext } from './lib/stdio-context';
import { formatJson } from './lib/stable-json';
import { asScalarText } from './lib/text-format';

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

export const runHumanCli = async (
	argv: readonly string[],
	cwd = process.cwd(),
): Promise<number> => {
	const commands = registerAllCommands();
	const parsed = parseCliInvocation(argv, cwd);
	if (parsed.version) {
		process.stdout.write(`${CLI_VERSION}\n`);
		return EXIT_CODE.OK;
	}
	if (parsed.help) {
		process.stdout.write(renderHelp(commands));
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
	let ctx;
	try {
		ctx = await createStdioContext(cwd, parsed.globals, extraPlugins);
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
			process.stdout.write(
				parsed.globals.json
					? formatJson(result.data)
					: asScalarText(result.data),
			);
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
