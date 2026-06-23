import { CLI_VERSION } from '../contracts/constants/version.constant';
import { helpTranslationFor } from '../contracts/constants/help-translation.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

/** Group label for a command: its first word, or `general` for single-word commands. */
const groupOf = (name: string): string => {
	const idx = name.indexOf(' ');
	return idx === -1 ? 'general' : name.slice(0, idx);
};

/**
 * Group commands by their first word (`git`, `memory`, `proposals`, …),
 * single-word commands under `general`. Preserves first-seen order both
 * for the groups and the commands within each group (f00046 S11).
 */
const groupCommands = (
	commands: readonly ICliCommand[],
): ReadonlyArray<readonly [string, readonly ICliCommand[]]> => {
	const groups = new Map<string, ICliCommand[]>();
	for (const command of commands) {
		const key = groupOf(command.name);
		const bucket = groups.get(key) ?? [];
		bucket.push(command);
		groups.set(key, bucket);
	}
	return [...groups.entries()];
};

export const renderHelp = (
	commands: readonly ICliCommand[],
	lang = 'en',
): string => {
	const t = helpTranslationFor(lang);
	const summaryOf = (command: ICliCommand): string =>
		t.commandSummaries[command.name] ?? command.summary;
	const commandLines = groupCommands(commands).flatMap(
		([group, group_commands]) => [
			'',
			`  ${group}:`,
			...group_commands.map(
				(command) =>
					`    ${command.name.padEnd(24)} ${summaryOf(command)}`,
			),
		],
	);
	return [
		`mcp-vertex ${CLI_VERSION}`,
		'',
		t.usage,
		'  mcpv [global flags] <command> [args]',
		'',
		t.globalFlags,
		`  --workspace <path>   ${t.flagWorkspace}`,
		`  --remote=stdio       ${t.flagRemote}`,
		`  --plugins=a,b        ${t.flagPlugins}`,
		`  --preset=<name>      ${t.flagPreset}`,
		`  --config=<path>      ${t.flagConfig}`,
		`  --json               ${t.flagJson}`,
		`  --help, -h           ${t.flagHelp}`,
		`  --version, -v        ${t.flagVersion}`,
		'',
		t.commands,
		...commandLines,
		'',
	].join('\n');
};
