import { CLI_VERSION } from '../contracts/constants/version.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

export const renderHelp = (commands: readonly ICliCommand[]): string =>
	[
		`mcp-vertex ${CLI_VERSION}`,
		'',
		'Usage:',
		'  mcpv [global flags] <command> [args]',
		'',
		'Global flags:',
		'  --workspace <path>   Workspace root (default: current directory)',
		'  --remote=stdio       Use stdio transport (tcp:// is reserved for v2)',
		'  --plugins=a,b        Extra plugins to load into the MCP server',
		'  --preset=<name>      Core plugin preset passed to the MCP server',
		'  --config=<path>      Config file passed to the MCP server',
		'  --json               Print stable JSON',
		'  --help, -h           Show help',
		'  --version, -v        Show version',
		'',
		'Commands:',
		...commands.map(
			(command) => `  ${command.name.padEnd(18)} ${command.summary}`,
		),
		'',
	].join('\n');
