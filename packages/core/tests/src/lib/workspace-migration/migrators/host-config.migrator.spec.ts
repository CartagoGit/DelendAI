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

import { parseJsonc } from '@delendai/core/lib/config/jsonc-document';
import {
	HOST_CONFIG_NAME,
	createHostConfigMigrator,
} from '@delendai/core/lib/workspace-migration/migrators/host-config.migrator';
import { HostConfigParseError } from '@delendai/core/lib/workspace-migration/migrators/host-config-parse.error';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-host-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeHostConfig = async (
	workspace: string,
	contents: string
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
			})
		);
		const migrator = createHostConfigMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('plan emits a rewrite-host-config step when the file carries legacy identity', async () => {
		await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { 'mcp-vertex': { type: 'stdio', command: 'bun' } },
			})
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
			})
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
			})
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
			})
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
			})
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
			'{ "servers": { "mcp-vertex": },,, }\n'
		);
		const migrator = createHostConfigMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			HostConfigParseError
		);
	});

	it('does not write back the file when the parse fails', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			'{ "servers": { "mcp-vertex": },,, }\n'
		);
		const original = await readFile(path, 'utf8');
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot)).catch(() => undefined);
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('no-ops cleanly when the file is absent', async () => {
		const migrator = createHostConfigMigrator();
		await expect(
			migrator.apply(ctx(workspaceRoot))
		).resolves.toBeUndefined();
	});

	it('does not write the file when no server carries legacy identity', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { delendai: { type: 'stdio', command: 'bun' } },
			})
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
			})
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const first = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const second = await readFile(path, 'utf8');
		expect(second).toBe(first);
	});
});

describe('host-config.migrator — the root .mcp.json', () => {
	it('rewrites the root config other hosts read, as it does the editor one', async () => {
		const root = join(workspaceRoot, '.mcp.json');
		await writeFile(
			root,
			pretty({
				mcpServers: {
					'mcp-vertex': { command: 'npx', args: ['@mcp-vertex/cli'] },
				},
			}),
			'utf8'
		);
		const migrator = createHostConfigMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(true);
		expect((await migrator.plan(ctx(workspaceRoot)))[0]?.detail).toContain(
			'.mcp.json'
		);

		await migrator.apply(ctx(workspaceRoot));

		const after = await readFile(root, 'utf8');
		expect(after).not.toMatch(/mcp-vertex/u);
		expect(after).toContain('delendai');
	});
});

describe('host-config.migrator — every host the workspace configures', () => {
	it('rewrites the Cursor, Continue and Codex configs that name the old server', async () => {
		await mkdir(join(workspaceRoot, '.cursor'), { recursive: true });
		await writeFile(
			join(workspaceRoot, '.cursor/mcp.json'),
			pretty({ mcpServers: { 'mcp-vertex': { command: 'mcp-vertex' } } })
		);
		await mkdir(join(workspaceRoot, '.continue'), { recursive: true });
		await writeFile(
			join(workspaceRoot, '.continue/config.json'),
			pretty({
				experimental: {
					modelContextProtocolServers: [
						{
							transport: {
								type: 'stdio',
								command: 'mcp-vertex',
								args: ['serve'],
							},
						},
					],
				},
			})
		);
		await mkdir(join(workspaceRoot, '.codex'), { recursive: true });
		await writeFile(
			join(workspaceRoot, '.codex/config.toml'),
			[
				'model = "mcp-vertex-is-not-a-server-here"',
				'',
				'[mcp_servers.mcp-vertex]',
				'command = "mcp-vertex"',
				'args = ["serve"]',
				'',
			].join('\n')
		);
		const migrator = createHostConfigMigrator();

		expect(await migrator.detect(ctx(workspaceRoot))).toBe(true);
		expect(await migrator.plan(ctx(workspaceRoot))).toHaveLength(3);
		await migrator.apply(ctx(workspaceRoot));

		const cursor = await readFile(
			join(workspaceRoot, '.cursor/mcp.json'),
			'utf8'
		);
		const continueConfig = await readFile(
			join(workspaceRoot, '.continue/config.json'),
			'utf8'
		);
		const codex = await readFile(
			join(workspaceRoot, '.codex/config.toml'),
			'utf8'
		);
		expect(cursor).not.toContain('mcp-vertex');
		expect(cursor).toContain('"delendai"');
		expect(continueConfig).not.toContain('mcp-vertex');
		expect(codex).toContain('[mcp_servers.delendai]');
		expect(codex).toContain('command = "delendai"');
		// Outside its server tables, the file is the person's.
		expect(codex).toContain('model = "mcp-vertex-is-not-a-server-here"');
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('reads a commented Continue config, keeps its comments, and never fails on one it cannot read', async () => {
		await mkdir(join(workspaceRoot, '.continue'), { recursive: true });
		const commented = [
			'{',
			"\t// the person's own note",
			'\t"experimental": {',
			'\t\t"modelContextProtocolServers": [',
			'\t\t\t{ "transport": { "type": "stdio", "command": "mcp-vertex" } },',
			'\t\t],',
			'\t},',
			'}',
			'',
		].join('\n');
		await writeFile(
			join(workspaceRoot, '.continue/config.json'),
			commented
		);
		await mkdir(join(workspaceRoot, '.cursor'), { recursive: true });
		await writeFile(
			join(workspaceRoot, '.cursor/mcp.json'),
			'{ not json at all'
		);
		const migrator = createHostConfigMigrator();

		expect(await migrator.plan(ctx(workspaceRoot))).toHaveLength(1);
		await migrator.apply(ctx(workspaceRoot));

		const after = await readFile(
			join(workspaceRoot, '.continue/config.json'),
			'utf8'
		);
		expect(after).toContain("// the person's own note");
		expect(after).toContain('"command": "delendai"');
		expect(
			await readFile(join(workspaceRoot, '.cursor/mcp.json'), 'utf8')
		).toBe('{ not json at all');
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('leaves a commented config that names nothing old exactly as it was', async () => {
		await mkdir(join(workspaceRoot, '.continue'), { recursive: true });
		const own = '{\n\t// nothing of ours\n\t"models": [],\n}\n';
		await writeFile(join(workspaceRoot, '.continue/config.json'), own);
		const migrator = createHostConfigMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
		await migrator.apply(ctx(workspaceRoot));
		expect(
			await readFile(join(workspaceRoot, '.continue/config.json'), 'utf8')
		).toBe(own);
	});
});

describe('host-config.migrator — the editor config is JSONC', () => {
	// A `.vscode/mcp.json` with a comment above the object is what the
	// editor itself accepts, and what a generator script writes. Read as
	// plain JSON it was unreadable, and the error it raised reached the
	// boot of every project that has one.
	const commented = [
		'// Generated by `bun run mcp:sync` — do not edit by hand.',
		'// The MCP servers are declared once, in the root .mcp.json.',
		'{',
		'\t"servers": {',
		'\t\t"mcp-vertex": {',
		'\t\t\t"type": "stdio",',
		'\t\t\t"command": "bun",',
		'\t\t\t"args": ["@mcp-vertex/core"]',
		'\t\t}',
		'\t}',
		'}',
		'',
	].join('\n');

	it('reads a commented editor config, rewrites it and keeps its comments', async () => {
		const path = await writeHostConfig(workspaceRoot, commented);
		const migrator = createHostConfigMigrator();

		expect(await migrator.plan(ctx(workspaceRoot))).toHaveLength(1);
		await migrator.apply(ctx(workspaceRoot));

		const after = await readFile(path, 'utf8');
		expect(after).toContain(
			'// Generated by `bun run mcp:sync` — do not edit by hand.'
		);
		expect(after).toContain(
			'// The MCP servers are declared once, in the root .mcp.json.'
		);
		expect(after).not.toContain('mcp-vertex');
		const parsed = parseJsonc(after);
		expect(parsed.errors).toEqual([]);
		const servers = (
			parsed.value as { readonly servers: Record<string, unknown> }
		).servers;
		expect(Object.keys(servers)).toEqual(['delendai']);
	});

	it('leaves a commented editor config that names nothing old byte-identical', async () => {
		const own = [
			'// Generated by `bun run mcp:sync` — do not edit by hand.',
			'{',
			'\t"servers": {',
			'\t\t"delendai": { "type": "stdio", "command": "bun" }',
			'\t}',
			'}',
			'',
		].join('\n');
		const path = await writeHostConfig(workspaceRoot, own);
		const migrator = createHostConfigMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
		await migrator.apply(ctx(workspaceRoot));
		expect(await readFile(path, 'utf8')).toBe(own);
	});

	it('writes a plain JSON editor config exactly as it always did', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			pretty({
				servers: { 'mcp-vertex': { type: 'stdio', command: 'bun' } },
			})
		);
		const migrator = createHostConfigMigrator();
		await migrator.apply(ctx(workspaceRoot));
		expect(await readFile(path, 'utf8')).toBe(
			pretty({
				servers: { delendai: { type: 'stdio', command: 'bun' } },
			})
		);
	});

	it('still refuses a file that is neither JSON nor JSONC', async () => {
		const path = await writeHostConfig(
			workspaceRoot,
			'{ "servers": { "mcp-vertex": },,, }\n'
		);
		const original = await readFile(path, 'utf8');
		const migrator = createHostConfigMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			HostConfigParseError
		);
		expect(await readFile(path, 'utf8')).toBe(original);
	});
});
