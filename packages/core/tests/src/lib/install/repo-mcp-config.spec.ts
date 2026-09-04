import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../..',
);

/**
 * The checked-in MCP clients must use one of the two canonical launches
 * (mirrors `tools/scripts/lint/self-host-dogfood.script.ts`):
 *
 *   1. published CLI: `bunx --package @delendai/cli delendai __serve --workspace <ws>`
 *   2. repo-local dogfood (while `@delendai/cli` is unpublished):
 *      `bun tools/scripts/host/host-server.script.ts --workspace=<ws>`
 */
const publishedLaunch = (workspace: string) => ({
	command: 'bunx',
	args: [
		'--package',
		'@delendai/cli',
		'delendai',
		'__serve',
		'--workspace',
		workspace,
	],
});

const localDogfoodLaunch = (workspace: string) => ({
	command: 'bun',
	args: [
		'tools/scripts/host/host-server.script.ts',
		`--workspace=${workspace}`,
	],
});

const expectCanonicalLaunch = (
	entry: { command?: string; args?: readonly string[] } | undefined,
	workspace: string,
): void => {
	expect(entry).toBeDefined();
	const accepted = [
		publishedLaunch(workspace),
		localDogfoodLaunch(workspace),
	];
	const matches = accepted.some(
		(launch) =>
			entry?.command === launch.command &&
			JSON.stringify(entry?.args) === JSON.stringify(launch.args),
	);
	expect(
		matches,
		`launch ${JSON.stringify(entry)} must match one of ${JSON.stringify(accepted)}`,
	).toBe(true);
};

const readJson = (path: string): unknown =>
	JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as unknown;

describe('repo MCP client configs', async () => {
	it('points Claude-style .mcp.json at a canonical launch', async () => {
		const config = readJson('.mcp.json') as {
			readonly mcpServers?: {
				readonly delendai?: {
					readonly command?: string;
					readonly args?: readonly string[];
				};
			};
		};
		expectCanonicalLaunch(config.mcpServers?.['delendai'], '.');
	});

	it('points VS Code/Copilot mcp.json at a canonical launch', async () => {
		const config = readJson('.vscode/mcp.json') as {
			readonly servers?: {
				readonly delendai?: {
					readonly type?: string;
					readonly command?: string;
					readonly args?: readonly string[];
				};
			};
		};
		const entry = config.servers?.['delendai'];

		expect(entry?.type).toBe('stdio');
		expectCanonicalLaunch(entry, '${workspaceFolder}');
	});

	it('ships a project-scoped Codex config on the same canonical launch', async () => {
		const config = readFileSync(join(ROOT, '.codex/config.toml'), 'utf8');

		expect(config).toContain('[mcp_servers.delendai]');
		const published =
			config.includes('command = "bunx"') &&
			config.includes(
				'args = ["--package", "@delendai/cli", "delendai", "__serve", "--workspace", "."]',
			);
		const localDogfood =
			config.includes('command = "bun"') &&
			config.includes(
				'args = ["tools/scripts/host/host-server.script.ts", "--workspace=."]',
			);
		expect(
			published || localDogfood,
			'.codex/config.toml must use the published bunx launch or the repo-local host-source launch',
		).toBe(true);
		expect(config).toContain('cwd = ".."');
	});
});
