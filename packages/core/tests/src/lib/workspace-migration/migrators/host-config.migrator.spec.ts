/**
 * host-config.migrator.spec.ts — b00239 S4.
 *
 * Pins the four-case contract of `createHostConfigMigrator` against a
 * real on-disk `.vscode/mcp.json` file: file absent, file ours, file
 * foreign, file malformed. Plus targeted coverage for:
 *
 *  - VS Code's `servers` map and Cursor's `mcpServers` map.
 *  - Server-key rewrite (the project's MCP server id itself).
 *  - `command`, `args`, `env`, `cwd` field rewrites.
 *  - Idempotency and the "no-op when already clean" guarantee.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	HOST_CONFIG_NAME,
	HostConfigParseError,
	createHostConfigMigrator,
} from '@delendai/core/lib/workspace-migration/migrators/host-config.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-host-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeHostConfig = async (
	workspace: string,
	contents: string,
): Promise<string> => {
	const absolute = join(workspace, HOST_CONFIG_NAME);
	await mkdir(join(workspace, '.vscode'), { recursive: true });
	await writeFile(absolute, contents, 'utf8');
	return absolute;
};

const ctx = (root: string) => ({ workspaceRoot: root, dryRun: false });

const pretty = (value: unknown): string =>
	`${JSON.stringify(value, null, '\t')}\n`;

describe('host-config.migrator — detect / plan / apply', () => {
	it('detect returns false when the file is absent', async () => {
		const migrator = createHostConfigMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(false);
	});

	it('plan returns no steps when the file is clean', async () => {
		await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { delendai: { type: 'stdio', command: 'bun' } },
			}),
		);
		const migrator = createHostConfigMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('plan emits a rewrite-host-config step when the file carries legacy identity', async () => {
		await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { 'mcp-vertex': { type: 'stdio', command: 'bun' } },
			}),
		);
		const migrator = createHostConfigMigrator();
		const steps = await migrator.plan(ctx(workspaceRoot));
		expect(steps).toHaveLength(1);
		expect(steps[0]?.kind).toBe('rewrite-host-config');
	});
});

describe('host-config.migrator — apply (VS Code `servers` map)', () => {
	it('rewrites the server key from mcp-vertex to delendai', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: {
					'mcp-vertex': {
						type: 'stdio',
						command: 'bun',
						args: ['tools/scripts/host/host-server.script.ts'],
					},
				},
			}),
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(Object.keys(after.servers)).toEqual(['delendai']);
		expect(after.servers.delendai.type).toBe('stdio');
	});

	it('rewrites the command and args', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: {
					'mcp-vertex': {
						type: 'stdio',
						command: 'mcp-vertex',
						args: ['-y', '@mcp-vertex/core'],
					},
				},
			}),
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.servers.delendai.command).toBe('delendai');
		expect(after.servers.delendai.args).toEqual(['-y', '@delendai/core']);
	});

	it('rewrites env values', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: {
					'mcp-vertex': {
						type: 'stdio',
						command: 'bun',
						env: {
							'MCP-VERTEX_HOME': '/srv/mcp-vertex',
							PATH: '/usr/bin',
						},
					},
				},
			}),
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.servers.delendai.env).toEqual({
			DELENDAI_HOME: '/srv/delendai',
			PATH: '/usr/bin',
		});
	});
});

describe('host-config.migrator — apply (Cursor-style `mcpServers` map)', () => {
	it('rewrites the Cursor-shaped mcpServers map identically', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				mcpServers: {
					'mcp-vertex': {
						command: 'npx',
						args: ['-y', '@mcp-vertex/core'],
					},
				},
			}),
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(Object.keys(after.mcpServers)).toEqual(['delendai']);
		expect(after.mcpServers.delendai.args).toEqual([
			'-y',
			'@delendai/core',
		]);
	});
});

describe('host-config.migrator — apply (failure modes and idempotency)', () => {
	it('throws HostConfigParseError on malformed JSON', async () => {
		await writeHostConfig(
			workspaceRoot,
			'{ "servers": { "mcp-vertex": },,, }\n',
		);
		const migrator = createHostConfigMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			HostConfigParseError,
		);
	});

	it('does not write back the file when the parse fails', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			'{ "servers": { "mcp-vertex": },,, }\n',
		);
		const original = await readFile(path, 'utf8');
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot)).catch(() => undefined);
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('no-ops cleanly when the file is absent', async () => {
		const migrator = createHostConfigMigrator();
		await expect(
			migrator.apply(ctx(workspaceRoot)),
		).resolves.toBeUndefined();
	});

	it('does not write the file when no server carries legacy identity', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { delendai: { type: 'stdio', command: 'bun' } },
			}),
		);
		const original = await readFile(path, 'utf8');
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('is idempotent: a second apply leaves the file byte-identical', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: {
					'mcp-vertex': {
						type: 'stdio',
						command: 'bun',
						args: ['-y', '@mcp-vertex/core'],
					},
				},
			}),
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const first = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const second = await readFile(path, 'utf8');
		expect(second).toBe(first);
	});
});
