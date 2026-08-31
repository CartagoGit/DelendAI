/**
 * f00084 S2 — regression coverage for `init-writers.factory`.
 *
 * Specifically guards against the merge-branch of `writeMcpJson` writing the
 * `.mcp.json` payload into the wrong file (it used to hardcode
 * `.vscode/mcp.json` for both the fresh-install and the merge path; a 2026-07
 * audit caught the merge path regressing to a hardcoded literal). Other
 * writers are exercised end-to-end by the integration / command specs; this
 * spec focuses on the targeted merge-path behaviour.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile as fsWriteFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	writeGenericMcpJson,
	writeVscodeMcpJson,
} from './init-writers.factory';
import { buildCanonicalLaunch } from '../server-args.service';

describe('init-writers.factory (f00084 S2)', () => {
	let workspace: string;
	const launch = buildCanonicalLaunch({ workspace: '${workspaceFolder}' });

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'mcpv-writers-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('writeVscodeMcpJson writes the merged payload into .vscode/mcp.json (not .mcp.json)', async () => {
		// Seed an existing .vscode/mcp.json so the merge branch fires.
		await mkdir(join(workspace, '.vscode'), { recursive: true });
		await fsWriteFile(
			join(workspace, '.vscode/mcp.json'),
			'{"servers":{"filesystem":{"command":"fs","args":["x"]}}}\n',
			'utf8',
		);

		const result = await writeVscodeMcpJson(workspace, launch, 'append');

		expect(result.kind).toBe('merged');
		expect(result.path).toBe(join(workspace, '.vscode/mcp.json'));

		const onDisk = JSON.parse(
			await readFile(join(workspace, '.vscode/mcp.json'), 'utf8'),
		) as { servers: Record<string, unknown> };
		expect(Object.keys(onDisk.servers).sort()).toEqual([
			'filesystem',
			'mcp-vertex',
		]);

		// And `.mcp.json` must NOT exist — the merge must not have leaked
		// into the generic-config path.
		await expect(
			readFile(join(workspace, '.mcp.json'), 'utf8'),
		).rejects.toThrow();
	});

	it('writeGenericMcpJson writes the merged payload into .mcp.json (not .vscode/mcp.json)', async () => {
		// Seed an existing .mcp.json so the merge branch fires.
		await fsWriteFile(
			join(workspace, '.mcp.json'),
			'{"mcpServers":{"filesystem":{"command":"fs","args":["x"]}}}\n',
			'utf8',
		);

		const result = await writeGenericMcpJson(workspace, launch, 'append');

		expect(result.kind).toBe('merged');
		expect(result.path).toBe(join(workspace, '.mcp.json'));

		const onDisk = JSON.parse(
			await readFile(join(workspace, '.mcp.json'), 'utf8'),
		) as { mcpServers: Record<string, unknown> };
		expect(Object.keys(onDisk.mcpServers).sort()).toEqual([
			'filesystem',
			'mcp-vertex',
		]);

		// And `.vscode/mcp.json` must NOT exist — the merge must not have
		// leaked into the VS-Code path.
		await expect(
			readFile(join(workspace, '.vscode/mcp.json'), 'utf8'),
		).rejects.toThrow();
	});

	it('preserves and upserts a configured server name during merge', async () => {
		await mkdir(join(workspace, '.vscode'), { recursive: true });
		await fsWriteFile(
			join(workspace, '.vscode/mcp.json'),
			'{"servers":{"filesystem":{"command":"fs","args":["x"]}}}\n',
			'utf8',
		);

		const result = await writeVscodeMcpJson(
			workspace,
			launch,
			'append',
			'acme-tools',
		);

		expect(result.kind).toBe('merged');
		const onDisk = JSON.parse(
			await readFile(join(workspace, '.vscode/mcp.json'), 'utf8'),
		) as { servers: Record<string, unknown> };
		expect(Object.keys(onDisk.servers).sort()).toEqual([
			'acme-tools',
			'filesystem',
		]);
	});

	it('writes the configured server name on a fresh install', async () => {
		const result = await writeVscodeMcpJson(
			workspace,
			launch,
			'append',
			'acme-tools',
		);

		expect(result.kind).toBe('written');
		const onDisk = JSON.parse(
			await readFile(join(workspace, '.vscode/mcp.json'), 'utf8'),
		) as { servers: Record<string, unknown> };
		expect(Object.keys(onDisk.servers)).toEqual(['acme-tools']);
	});
});
