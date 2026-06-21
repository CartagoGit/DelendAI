import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../..',
);
const HOST_SCRIPT = 'tools/scripts/host/host-server.script.ts';

const readJson = (path: string): unknown =>
	JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as unknown;

describe('repo MCP client configs', () => {
	it('points Claude-style .mcp.json at the real host script', () => {
		const config = readJson('.mcp.json') as {
			readonly mcpServers?: {
				readonly 'mcp-vertex'?: {
					readonly command?: string;
					readonly args?: readonly string[];
				};
			};
		};
		const entry = config.mcpServers?.['mcp-vertex'];

		expect(entry?.command).toBe('bun');
		expect(entry?.args).toContain(HOST_SCRIPT);
		expect(existsSync(join(ROOT, HOST_SCRIPT))).toBe(true);
	});

	it('points VS Code/Copilot mcp.json at the real host script', () => {
		const config = readJson('.vscode/mcp.json') as {
			readonly servers?: {
				readonly 'mcp-vertex'?: {
					readonly type?: string;
					readonly command?: string;
					readonly args?: readonly string[];
				};
			};
		};
		const entry = config.servers?.['mcp-vertex'];

		expect(entry?.type).toBe('stdio');
		expect(entry?.command).toBe('bun');
		expect(entry?.args).toContain(
			'${workspaceFolder}/tools/scripts/host/host-server.script.ts',
		);
		expect(existsSync(join(ROOT, HOST_SCRIPT))).toBe(true);
	});

	it('ships a project-scoped Codex config for the same host script', () => {
		const config = readFileSync(join(ROOT, '.codex/config.toml'), 'utf8');

		expect(config).toContain('[mcp_servers.mcp-vertex]');
		expect(config).toContain('command = "bun"');
		expect(config).toContain(
			'args = ["tools/scripts/host/host-server.script.ts"]',
		);
		expect(config).toContain('cwd = ".."');
		expect(existsSync(join(ROOT, HOST_SCRIPT))).toBe(true);
	});
});
