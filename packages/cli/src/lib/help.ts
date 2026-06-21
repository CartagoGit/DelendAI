import { CLI_VERSION } from '../contracts/constants/version.constant';
import { helpTranslationFor } from '../contracts/constants/help-translation.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

export const renderHelp = (
	commands: readonly ICliCommand[],
	lang = 'en',
): string => {
	const t = helpTranslationFor(lang);
	const summaryOf = (command: ICliCommand): string =>
		t.commandSummaries[command.name] ?? command.summary;
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
		...commands.map(
			(command) => `  ${command.name.padEnd(18)} ${summaryOf(command)}`,
		),
		'',
	].join('\n');
};
