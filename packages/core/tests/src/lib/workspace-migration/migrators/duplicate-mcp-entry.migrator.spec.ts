/**
 * duplicate-mcp-entry.migrator.spec.ts — `.vscode/mcp.json` stops
 * repeating the server `.mcp.json` already starts.
 */
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDuplicateMcpEntryMigrator } from '@delendai/core/lib/workspace-migration/migrators/duplicate-mcp-entry.migrator';

let root = '';
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'duplicate-mcp-'));
	await mkdir(join(root, '.vscode'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
const ctx = () => ({ workspaceRoot: root, dryRun: false });
const entry = { type: 'stdio', command: 'bun', args: ['host'] };
const project = async (servers: object) =>
	writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: servers }));

describe('createDuplicateMcpEntryMigrator', () => {
	it('removes the repeated server and keeps the others and the comments', async () => {
		await project({ DelendAI: entry });
		await writeFile(
			join(root, '.vscode', 'mcp.json'),
			`// mine\n{"servers":{"DelendAI":{"command":"bun"},"github":{"command":"gh"}}}`,
		);
		const migrator = createDuplicateMcpEntryMigrator();
		expect(await migrator.detect(ctx())).toBe(true);
		await migrator.apply(ctx());
		const after = await readFile(join(root, '.vscode', 'mcp.json'), 'utf8');
		expect(after).toContain('// mine');
		expect(after).toContain('github');
		expect(after).not.toContain('DelendAI');
		expect(await migrator.detect(ctx())).toBe(false);
	});

	it('deletes .vscode/mcp.json when the repeated server was all it had', async () => {
		await project({ DelendAI: entry });
		await writeFile(
			join(root, '.vscode', 'mcp.json'),
			JSON.stringify({ servers: { DelendAI: entry } }),
		);
		await createDuplicateMcpEntryMigrator().apply(ctx());
		await expect(stat(join(root, '.vscode', 'mcp.json'))).rejects.toThrow();
	});

	it('leaves a project alone when .mcp.json does not start the server', async () => {
		await project({ other: entry });
		await writeFile(
			join(root, '.vscode', 'mcp.json'),
			JSON.stringify({ servers: { DelendAI: entry } }),
		);
		expect(await createDuplicateMcpEntryMigrator().detect(ctx())).toBe(
			false,
		);
	});
});
