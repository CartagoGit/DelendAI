/**
 * legacy-residue-registry.spec.ts — the registry's entries find the residue
 * in a fixture and migrate it once.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ILegacyResidueIO } from '@delendai/core/lib/contracts/interfaces/legacy-residue.interface';
import { legacyResidueRegistry } from '@delendai/core/lib/workspace-migration/legacy-residue/legacy-residue.registry';
import { createLegacyResidueMigrator } from '@delendai/core/lib/workspace-migration/legacy-residue/legacy-residue.migrator';

const memoryIO = (files: Map<string, string>): ILegacyResidueIO => ({
	readText: async (path) => files.get(path),
	writeText: async (path, text) => {
		files.set(path, text);
	},
});

const fixture = () =>
	new Map([
		[
			'/p/.mcp.json',
			'{"mcpServers":{"mcp-vertex":{"args":["--config=/p/mcp-vertex.config.json"]}}}',
		],
	]);

describe('the legacy residue registry', () => {
	it('[<20ms] declares every entry with the fields the contract names', () => {
		for (const entry of legacyResidueRegistry) {
			expect(entry.id).not.toBe('');
			expect(entry.since).not.toBe('');
			expect(['machine', 'project']).toContain(entry.scope);
		}
	});

	it('[<20ms] detects the retired name and launch shape in a fixture', async () => {
		const io = memoryIO(fixture());
		const found = await Promise.all(
			legacyResidueRegistry.map((entry) =>
				entry.detect({ root: '/p', io }),
			),
		);
		expect(found).toContain(true);
	});

	it('[<20ms] reports changes the first time and none the second', async () => {
		const files = fixture();
		const io = memoryIO(files);
		const [entry] = legacyResidueRegistry;
		expect(entry).toBeDefined();
		const first = await entry?.migrate({ root: '/p', io });
		expect(first).toEqual(['/p/.mcp.json']);
		expect(files.get('/p/.mcp.json')).toContain('delendai.config.json');
		expect(await entry?.migrate({ root: '/p', io })).toEqual([]);
		expect(await entry?.detect({ root: '/p', io })).toBe(false);
	});

	it('[<20ms] is consumed by the workspace migration over the same list', async () => {
		const files = fixture();
		const migrator = createLegacyResidueMigrator(
			legacyResidueRegistry,
			memoryIO(files),
		);
		const ctx = { workspaceRoot: '/p', dryRun: false };
		expect(await migrator.detect(ctx)).toBe(true);
		await migrator.apply(ctx);
		expect(await migrator.detect(ctx)).toBe(false);
	});
});

describe('the residue migration over the real filesystem', () => {
	it('[<100ms] migrates a temp project file and finds a clean one clean', async () => {
		const root = await mkdtemp(join(tmpdir(), 'legacy-residue-'));
		try {
			const migrator = createLegacyResidueMigrator();
			const ctx = { workspaceRoot: root, dryRun: false };
			expect(await migrator.detect(ctx)).toBe(false);
			await writeFile(
				join(root, '.mcp.json'),
				fixture().get('/p/.mcp.json') ?? '',
			);
			expect(await migrator.plan(ctx)).toHaveLength(1);
			await migrator.apply({ ...ctx, dryRun: true });
			expect(await migrator.detect(ctx)).toBe(true);
			await migrator.apply(ctx);
			expect(await migrator.detect(ctx)).toBe(false);
			expect(await readFile(join(root, '.mcp.json'), 'utf8')).toContain(
				'delendai.config.json',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
