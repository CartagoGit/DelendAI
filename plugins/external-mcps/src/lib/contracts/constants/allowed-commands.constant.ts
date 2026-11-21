/**
 * allowed-commands.constant.ts — the launchers an external MCP server may
 * be started with when the configuration names none: package runners and
 * runtimes that start a pinned package, nothing that runs arbitrary text.
 */
export const DEFAULT_ALLOWED_COMMANDS: readonly string[] = [
	'npx',
	'bunx',
	'uvx',
	'node',
	'bun',
	'deno',
	'python',
	'python3',
	'docker',
	'podman',
];
