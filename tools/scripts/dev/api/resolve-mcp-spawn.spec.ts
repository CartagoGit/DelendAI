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
				"mcp-vertex.server": {
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
			'{"mcp-vertex.server":{"command":"bun","args":["run","mcp-vertex"]}}',
		);
		writeFileSync(
			join(cwd, '.vscode', 'mcp.json'),
			JSON.stringify({
				servers: {
					'mcp-vertex': {
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
			args: ['run', 'mcp-vertex'],
			source: 'default',
		});
	});
});
