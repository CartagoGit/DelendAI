import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createWorkspacePathProvider,
	detectExistingDelendaiInstall,
	findDelendaiServerName,
	isDelendaiLaunchShape,
} from '@delendai/core/public';

// x00201 S2 — the postman-exporter project (delendai's own empirical
// adopter testbed) really is wired exactly this way: a `.vscode/mcp.json`
// with an `delendai` server launched via this repo's
// `host-server.script.ts`, alongside an unrelated `filesystem` MCP
// server. This fixture reproduces that shape structurally (no secrets,
// no project-specific paths beyond what the detector itself inspects).
const POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON = JSON.stringify({
	servers: {
		delendai: {
			type: 'stdio',
			command: 'bun',
			args: [
				'${userHome}/_projects/delendai/tools/scripts/host/host-server.script.ts',
				'--workspace=${workspaceFolder}',
				'--config=${workspaceFolder}/delendai.config.json',
			],
		},
		filesystem: {
			command: 'bunx',
			args: [
				'-y',
				'@modelcontextprotocol/server-filesystem',
				'${workspaceFolder}',
			],
		},
	},
});

// delendai's own root `.mcp.json` shape (`mcpServers`, not `servers`).
const DELENDAI_OWN_DOT_MCP_JSON = JSON.stringify({
	mcpServers: {
		delendai: {
			type: 'stdio',
			command: 'bun',
			args: ['tools/scripts/host/host-server.script.ts', '--workspace=.'],
		},
	},
});

describe('isDelendaiLaunchShape', () => {
	it('matches a repo-local host-server.script.ts launch', () => {
		expect(
			isDelendaiLaunchShape({
				command: 'bun',
				args: ['tools/scripts/host/host-server.script.ts'],
			}),
		).toBe(true);
	});

	it('matches a published @delendai/cli launch', () => {
		expect(
			isDelendaiLaunchShape({
				command: 'bunx',
				args: ['--package', '@delendai/cli', 'delendai', '__serve'],
			}),
		).toBe(true);
	});

	it('does not match an unrelated MCP server', () => {
		expect(
			isDelendaiLaunchShape({
				command: 'bunx',
				args: ['-y', '@modelcontextprotocol/server-filesystem'],
			}),
		).toBe(false);
	});
});

describe('findDelendaiServerName', () => {
	it('finds the delendai key in a .vscode/mcp.json-shaped ("servers") config, ignoring unrelated servers', () => {
		expect(
			findDelendaiServerName(POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON),
		).toBe('delendai');
	});

	it('finds the delendai key in a .mcp.json-shaped ("mcpServers") config', () => {
		expect(findDelendaiServerName(DELENDAI_OWN_DOT_MCP_JSON)).toBe(
			'delendai',
		);
	});

	it('returns undefined when no server matches', () => {
		expect(
			findDelendaiServerName(
				JSON.stringify({
					servers: { filesystem: { command: 'bunx' } },
				}),
			),
		).toBeUndefined();
	});

	it('returns undefined on malformed JSON instead of throwing', () => {
		expect(findDelendaiServerName('{not json')).toBeUndefined();
	});
});

describe('detectExistingDelendaiInstall', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'delendai-detect-install-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('detects a postman-exporter-shaped guest install: config + .vscode/mcp.json server', async () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({ plugins: {} }),
		);
		mkdirSync(join(root, '.vscode'), { recursive: true });
		writeFileSync(
			join(root, '.vscode', 'mcp.json'),
			POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON,
		);

		const result = await detectExistingDelendaiInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({
			existingDelendai: true,
			mcpServerName: 'delendai',
		});
	});

	it('detects an existing install via .mcp.json alone (no delendai.config.json read yet)', async () => {
		writeFileSync(join(root, '.mcp.json'), DELENDAI_OWN_DOT_MCP_JSON);

		const result = await detectExistingDelendaiInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({
			existingDelendai: true,
			mcpServerName: 'delendai',
		});
	});

	it('reports existingDelendai without a server name when only the config file is present', async () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({ plugins: {} }),
		);

		const result = await detectExistingDelendaiInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({ existingDelendai: true });
	});

	it('defaults to greenfield (existingDelendai: false) for an empty workspace', async () => {
		const result = await detectExistingDelendaiInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({ existingDelendai: false });
	});
});
