import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveMcpStdioSpawn } from './resolve-mcp-spawn';

describe('resolveMcpStdioSpawn', () => {
	let cwd: string;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'mcp-spawn-'));
		mkdirSync(join(cwd, '.vscode'), { recursive: true });
	});

	afterEach(() => rmSync(cwd, { recursive: true, force: true }));

	it('accepts the legacy VS Code extension settings as a JSONC fallback', async () => {
		writeFileSync(
			join(cwd, '.vscode', 'settings.json'),
			`{
				// Local override wins over mcp.json.
				"delendai.server": {
					"command": "custom-server",
					"args": "--workspace \${workspaceFolder}",
				},
			}`,
		);
		await expect(resolveMcpStdioSpawn(cwd)).resolves.toEqual({
			command: 'custom-server',
			args: ['--workspace', cwd],
			source: 'workspace-settings',
		});
	});

	it('uses the canonical .vscode/mcp.json declaration and expands workspace tokens', async () => {
		writeFileSync(
			join(cwd, '.vscode', 'settings.json'),
			'{"delendai.server":{"command":"bun","args":["run","delendai"]}}',
		);
		writeFileSync(
			join(cwd, '.vscode', 'mcp.json'),
			JSON.stringify({
				servers: {
					delendai: {
						command: 'bun',
						args: [
							'${workspaceFolder}/tools/scripts/host/host-server.script.ts',
							'--workspace=${workspaceFolder}',
						],
					},
				},
			}),
		);

		await expect(resolveMcpStdioSpawn(cwd)).resolves.toEqual({
			command: 'bun',
			args: [
				`${cwd}/tools/scripts/host/host-server.script.ts`,
				`--workspace=${cwd}`,
			],
			source: 'workspace-mcp',
		});
	});

	it('falls back without throwing when both workspace files are malformed', async () => {
		writeFileSync(join(cwd, '.vscode', 'settings.json'), '{ nope');
		writeFileSync(join(cwd, '.vscode', 'mcp.json'), '{ nope');

		await expect(resolveMcpStdioSpawn(cwd)).resolves.toEqual({
			command: 'bun',
			args: ['run', 'delendai'],
			source: 'default',
		});
	});

	it('uses the in-tree host when the self-host config points at the unpublished CLI', async () => {
		const localHost = join(cwd, 'tools/scripts/host/host-server.script.ts');
		mkdirSync(join(cwd, 'tools/scripts/host'), { recursive: true });
		writeFileSync(localHost, '');
		writeFileSync(join(cwd, 'delendai.config.json'), '{}');
		writeFileSync(
			join(cwd, '.vscode', 'mcp.json'),
			JSON.stringify({
				servers: {
					delendai: {
						command: 'bunx',
						args: [
							'--package',
							'@delendai/cli',
							'delendai',
							'__serve',
						],
					},
				},
			}),
		);

		await expect(resolveMcpStdioSpawn(cwd)).resolves.toEqual({
			command: 'bun',
			args: [
				localHost,
				`--workspace=${cwd}`,
				`--config=${join(cwd, 'delendai.config.json')}`,
			],
			source: 'workspace-local',
		});
	});
});
