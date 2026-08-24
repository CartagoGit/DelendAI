import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	GENERATED_DOCS_JSON_PATH,
	GENERATED_FIRST_PARTY_INDEX_PATH,
	GENERATED_WEB_CATALOG_PATH,
	README_PATH,
	README_PLUGIN_ROWS_END,
	README_PLUGIN_ROWS_START,
	runFromManifestsGenerator,
	buildCompatibilityMatrix,
	buildGeneratedFirstPartyEntries,
} from './from-manifests.script.ts';

const testIo = () => ({
	readText: async (absPath: string) => {
		try {
			return await readFile(absPath, 'utf8');
		} catch {
			return undefined;
		}
	},
	writeText: async (absPath: string, text: string) => {
		await writeFile(absPath, text, 'utf8');
	},
	ensureDir: async (absPath: string) => {
		await mkdir(absPath, { recursive: true });
	},
	info: () => {},
	error: () => {},
	fixedGeneratedAt: '2026-08-24T10:00:00.000Z',
});

const withFixture = async (
	callback: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'manifest-generator-'));
	try {
		await mkdir(join(root, 'plugins/search'), { recursive: true });
		await writeFile(
			join(root, 'plugins/search/package.json'),
			JSON.stringify(
				{
					name: '@mcp-vertex/search',
					version: '0.1.1',
					publishConfig: { access: 'public' },
				},
				null,
				'\t',
			) + '\n',
		);
		await writeFile(
			join(root, 'plugins/search/plugin.manifest.ts'),
			[
				'export const SEARCH_PLUGIN_MANIFEST = {',
				"\tid: 'search',",
				"\tpackage: '@mcp-vertex/search',",
				"\tversion: '0.1.1',",
				"\tvisibility: 'public',",
				"\tsummary: 'Code search (semantic + symbol + references).',",
				"\ttags: ['search', 'symbol', 'f00136'],",
				"\tmaturity: 'stable',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['minimal', 'lean', 'standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api', 'cli-tool'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@mcp-vertex/core', 'zod'],",
				"\tcapabilities: ['lexical-search', 'regex-search'],",
				'};\n',
			].join('\n'),
		);
		await mkdir(join(root, 'plugins/context-for-change'), {
			recursive: true,
		});
		await writeFile(
			join(root, 'plugins/context-for-change/package.json'),
			JSON.stringify(
				{
					name: '@mcp-vertex/context-for-change',
					version: '0.1.0',
					publishConfig: { access: 'public' },
				},
				null,
				'\t',
			) + '\n',
		);
		await writeFile(
			join(root, 'plugins/context-for-change/plugin.manifest.ts'),
			[
				'export const CONTEXT_FOR_CHANGE_PLUGIN_MANIFEST = {',
				"\tid: 'context-for-change',",
				"\tpackage: '@mcp-vertex/context-for-change',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Compact task-oriented change context orchestration.',",
				"\ttags: ['context', 'orchestration', 'compact', 'f00165'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@mcp-vertex/core', 'zod'],",
				"\tcapabilities: ['context-orchestration'],",
				'};\n',
			].join('\n'),
		);
		await writeFile(
			join(root, README_PATH),
			[
				'# Fixture',
				'',
				'| Path | Package | What |',
				'|---|---|---|',
				'| packages/core | @mcp-vertex/core | Core |',
				README_PLUGIN_ROWS_START,
				'| plugins/old | @mcp-vertex/old | stale |',
				README_PLUGIN_ROWS_END,
			].join('\n') + '\n',
		);
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('from-manifests generator', () => {
	it('builds generated first-party entries and a matching compatibility matrix', async () => {
		await withFixture(async (root) => {
			const run = await runFromManifestsGenerator(
				[`--root=${root}`],
				testIo(),
			);
			expect(run.exitCode).toBe(0);
			const result = run.result;
			expect(result).toBeDefined();
			const entries = buildGeneratedFirstPartyEntries(
				(result?.artifact.manifests ?? []).map((manifest) => ({
					id: manifest.id,
					dir: `plugins/${manifest.id}`,
					manifestPath: `plugins/${manifest.id}/plugin.manifest.ts`,
					packagePath: `plugins/${manifest.id}/package.json`,
					packageName: manifest.package,
					version: manifest.version,
					private: false,
					manifest,
				})),
			);
			expect(entries.map((entry) => entry.id)).toEqual([
				'context-for-change',
				'search',
			]);
			expect(entries[0]?.permissions).toEqual(['filesystem-read']);
			const compatibility = buildCompatibilityMatrix(
				(result?.artifact.manifests ?? []).map((manifest) => ({
					id: manifest.id,
					dir: `plugins/${manifest.id}`,
					manifestPath: `plugins/${manifest.id}/plugin.manifest.ts`,
					packagePath: `plugins/${manifest.id}/package.json`,
					packageName: manifest.package,
					version: manifest.version,
					private: false,
					manifest,
				})),
			);
			expect(compatibility.every((row) => row.matches)).toBe(true);
		});
	});

	it('writes the generated registry, web catalog, docs json, and README rows', async () => {
		await withFixture(async (root) => {
			const run = await runFromManifestsGenerator(
				[`--root=${root}`],
				testIo(),
			);
			expect(run.exitCode).toBe(0);
			expect(
				await readFile(
					join(root, GENERATED_FIRST_PARTY_INDEX_PATH),
					'utf8',
				),
			).toContain('search');
			expect(
				await readFile(join(root, GENERATED_WEB_CATALOG_PATH), 'utf8'),
			).toContain('GENERATED_PLUGIN_MANIFEST_WEB_CATALOG');
			expect(
				await readFile(join(root, GENERATED_DOCS_JSON_PATH), 'utf8'),
			).toContain('compatibilityMatrix');
			expect(
				await readFile(join(root, GENERATED_DOCS_JSON_PATH), 'utf8'),
			).toContain('filesystem-read');
			expect(await readFile(join(root, README_PATH), 'utf8')).toContain(
				'| `plugins/search` | `@mcp-vertex/search` | Code search (semantic + symbol + references). |',
			);
		});
	});

	it('--check exits 1 when generated outputs are stale', async () => {
		await withFixture(async (root) => {
			const first = await runFromManifestsGenerator(
				[`--root=${root}`],
				testIo(),
			);
			expect(first.exitCode).toBe(0);
			await writeFile(
				join(root, GENERATED_WEB_CATALOG_PATH),
				'export const GENERATED_PLUGIN_MANIFEST_WEB_CATALOG = [] as const;\n',
				'utf8',
			);
			const check = await runFromManifestsGenerator(
				[`--root=${root}`, '--check'],
				testIo(),
			);
			expect(check.exitCode).toBe(1);
		});
	});
});
