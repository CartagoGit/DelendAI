import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createWorkspacePathProvider,
	detectExistingMcpVertexInstall,
	findMcpVertexServerName,
	isMcpVertexLaunchShape,
} from '@delendai/core/public';

// x00201 S2 — the postman-exporter project (mcp-vertex's own empirical
// adopter testbed) really is wired exactly this way: a `.vscode/mcp.json`
// with an `mcp-vertex` server launched via this repo's
// `host-server.script.ts`, alongside an unrelated `filesystem` MCP
// server. This fixture reproduces that shape structurally (no secrets,
// no project-specific paths beyond what the detector itself inspects).
const POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON = JSON.stringify({
	servers: {
		'mcp-vertex': {
			type: 'stdio',
			command: 'bun',
			args: [
				'${userHome}/_projects/mcp-vertex/tools/scripts/host/host-server.script.ts',
				'--workspace=${workspaceFolder}',
				'--config=${workspaceFolder}/mcp-vertex.config.json',
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

// mcp-vertex's own root `.mcp.json` shape (`mcpServers`, not `servers`).
const MCP_VERTEX_OWN_DOT_MCP_JSON = JSON.stringify({
	mcpServers: {
		'mcp-vertex': {
			type: 'stdio',
			command: 'bun',
			args: ['tools/scripts/host/host-server.script.ts', '--workspace=.'],
		},
	},
});

describe('isMcpVertexLaunchShape', () => {
	it('matches a repo-local host-server.script.ts launch', () => {
		expect(
			isMcpVertexLaunchShape({
				command: 'bun',
				args: ['tools/scripts/host/host-server.script.ts'],
			}),
		).toBe(true);
	});

	it('matches a published @delendai/cli launch', () => {
		expect(
			isMcpVertexLaunchShape({
				command: 'bunx',
				args: ['--package', '@delendai/cli', 'mcpv', '__serve'],
			}),
		).toBe(true);
	});

	it('does not match an unrelated MCP server', () => {
		expect(
			isMcpVertexLaunchShape({
				command: 'bunx',
				args: ['-y', '@modelcontextprotocol/server-filesystem'],
			}),
		).toBe(false);
	});
});

describe('findMcpVertexServerName', () => {
	it('finds the mcp-vertex key in a .vscode/mcp.json-shaped ("servers") config, ignoring unrelated servers', () => {
		expect(
			findMcpVertexServerName(POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON),
		).toBe('mcp-vertex');
	});

	it('finds the mcp-vertex key in a .mcp.json-shaped ("mcpServers") config', () => {
		expect(findMcpVertexServerName(MCP_VERTEX_OWN_DOT_MCP_JSON)).toBe(
			'mcp-vertex',
		);
	});

	it('returns undefined when no server matches', () => {
		expect(
			findMcpVertexServerName(
				JSON.stringify({
					servers: { filesystem: { command: 'bunx' } },
				}),
			),
		).toBeUndefined();
	});

	it('returns undefined on malformed JSON instead of throwing', () => {
		expect(findMcpVertexServerName('{not json')).toBeUndefined();
	});
});

describe('detectExistingMcpVertexInstall', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'mcp-vertex-detect-install-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('detects a postman-exporter-shaped guest install: config + .vscode/mcp.json server', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			JSON.stringify({ plugins: {} }),
		);
		mkdirSync(join(root, '.vscode'), { recursive: true });
		writeFileSync(
			join(root, '.vscode', 'mcp.json'),
			POSTMAN_EXPORTER_SHAPED_VSCODE_MCP_JSON,
		);

		const result = await detectExistingMcpVertexInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({
			existingMcpVertex: true,
			mcpServerName: 'mcp-vertex',
		});
	});

	it('detects an existing install via .mcp.json alone (no mcp-vertex.config.json read yet)', async () => {
		writeFileSync(join(root, '.mcp.json'), MCP_VERTEX_OWN_DOT_MCP_JSON);

		const result = await detectExistingMcpVertexInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({
			existingMcpVertex: true,
			mcpServerName: 'mcp-vertex',
		});
	});

	it('reports existingMcpVertex without a server name when only the config file is present', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			JSON.stringify({ plugins: {} }),
		);

		const result = await detectExistingMcpVertexInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({ existingMcpVertex: true });
	});

	it('defaults to greenfield (existingMcpVertex: false) for an empty workspace', async () => {
		const result = await detectExistingMcpVertexInstall(
			createWorkspacePathProvider(root),
		);
		expect(result).toEqual({ existingMcpVertex: false });
	});
});
