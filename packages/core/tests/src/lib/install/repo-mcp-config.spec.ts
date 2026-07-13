import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../..',
);
const CANONICAL_ARGS = [
	'--package',
	'@mcp-vertex/cli',
	'mcpv',
	'__serve',
	'--workspace',
] as const;

const readJson = (path: string): unknown =>
	JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as unknown;

describe('repo MCP client configs', async () => {
	it('points Claude-style .mcp.json at the published CLI', async () => {
		const config = readJson('.mcp.json') as {
			readonly mcpServers?: {
				readonly 'mcp-vertex'?: {
					readonly command?: string;
					readonly args?: readonly string[];
				};
			};
		};
		const entry = config.mcpServers?.['mcp-vertex'];

		expect(entry?.command).toBe('bunx');
		expect(entry?.args).toEqual([...CANONICAL_ARGS, '.']);
	});

	it('points VS Code/Copilot mcp.json at the published CLI', async () => {
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
		expect(entry?.command).toBe('bunx');
		expect(entry?.args).toEqual([...CANONICAL_ARGS, '${workspaceFolder}']);
	});

	it('ships a project-scoped Codex config for the same published CLI', async () => {
		const config = readFileSync(join(ROOT, '.codex/config.toml'), 'utf8');

		expect(config).toContain('[mcp_servers.mcp-vertex]');
		expect(config).toContain('command = "bunx"');
		expect(config).toContain(
			'args = ["--package", "@mcp-vertex/cli", "mcpv", "__serve", "--workspace", "."]',
		);
		expect(config).toContain('cwd = ".."');
	});
});
