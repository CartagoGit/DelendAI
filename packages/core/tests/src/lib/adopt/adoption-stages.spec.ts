/**
 * adoption-stages.spec.ts — f00280 S3 acceptance for the cumulative
 * adoption-stage contract (`adopt_project.stage`).
 *
 * Three acceptance points (per proposal):
 *  1. Invoking adopt_project with NO stage installs only `core` plugins.
 *  2. Specifying a later stage ADDS plugins on top of the previous
 *     stages (cumulative, never replaces).
 *  3. `specialized` is a sentinel — it lets the assessment's remaining
 *     recommended set flow through unmodified.
 *
 * Tests cover the pure constant (`resolveStagePluginIds`,
 * `isAdoptionStage`) and the tool's end-to-end stage filter.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ADOPTION_STAGES,
	ADOPTION_STAGE_CATALOG,
	DEFAULT_ADOPTION_STAGE,
	isAdoptionStage,
	resolveStagePluginIds,
} from '@delendai/core/lib/adopt/adoption-stages.constant';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import { createWorkspaceFileReader } from '@delendai/core/lib/bootstrap/workspace-file-reader';
import { buildAdoptProjectToolRegistration } from '@delendai/core/lib/adopt/adopt-project.tool';

const capture = async (
	reg: ReturnType<typeof buildAdoptProjectToolRegistration>,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};

const parse = (r: { content: Array<{ text: string }> }): unknown =>
	JSON.parse(r.content[0]?.text ?? '{}');

const pluginsOf = (config: unknown): readonly string[] => {
	if (
		config === null ||
		typeof config !== 'object' ||
		!('plugins' in config)
	) {
		return [];
	}
	const record = (config as { plugins?: unknown }).plugins;
	if (record === null || typeof record !== 'object') return [];
	return Object.keys(record as Record<string, unknown>).sort();
};

describe('adoption-stages constant (f00280 S3)', () => {
	it('exposes four stages in ascending order of surface', () => {
		expect(ADOPTION_STAGES).toEqual([
			'core',
			'standard',
			'agents',
			'specialized',
		]);
	});

	it('defaults to `core` (minimum viable adoption)', () => {
		expect(DEFAULT_ADOPTION_STAGE).toBe('core');
	});

	it('keeps the catalog ordered so resolution walks cumulative stages', () => {
		expect(ADOPTION_STAGE_CATALOG.map((entry) => entry.id)).toEqual(
			ADOPTION_STAGES,
		);
	});

	it('type guard accepts the canonical ids and rejects anything else', () => {
		expect(isAdoptionStage('core')).toBe(true);
		expect(isAdoptionStage('standard')).toBe(true);
		expect(isAdoptionStage('agents')).toBe(true);
		expect(isAdoptionStage('specialized')).toBe(true);
		expect(isAdoptionStage('full')).toBe(false);
		expect(isAdoptionStage(undefined)).toBe(false);
		expect(isAdoptionStage(42)).toBe(false);
		expect(isAdoptionStage(null)).toBe(false);
	});

	it('resolveStagePluginIds is cumulative and adds (never replaces)', () => {
		const core = resolveStagePluginIds('core');
		const standard = resolveStagePluginIds('standard');
		const agents = resolveStagePluginIds('agents');
		// Every standard id is also in core; every agents id is also in standard.
		for (const id of core) expect(standard).toContain(id);
		for (const id of standard) expect(agents).toContain(id);
		// core strictly smaller than standard strictly smaller than agents.
		expect(new Set(agents).size).toBeGreaterThan(new Set(standard).size);
		expect(new Set(standard).size).toBeGreaterThan(new Set(core).size);
	});

	it('resolveStagePluginIds("specialized") returns [] — sentinel', () => {
		expect(resolveStagePluginIds('specialized')).toEqual([]);
	});

	it('core plugin ids are git / search / docs / memory (the minimum viable)', () => {
		const ids = resolveStagePluginIds('core');
		expect(ids).toContain('git');
		expect(ids).toContain('search');
		expect(ids).toContain('docs');
		expect(ids).toContain('memory');
	});
});

describe('adopt_project stage filter (f00280 S3)', () => {
	let root = '';
	let adopt: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'adopt-stages-'));
		// Seed a minimal package.json so analyzeProject recognizes the
		// workspace as a TypeScript project. Without it, deriveConfig
		// may produce an empty config and the stage filter has nothing
		// to compare.
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'fixture',
				private: true,
				workspaces: ['packages/*'],
			}),
		);
		mkdirSync(join(root, 'packages', 'app'), { recursive: true });
		writeFileSync(
			join(root, 'packages', 'app', 'package.json'),
			JSON.stringify({
				name: '@fixture/app',
				private: true,
				scripts: { test: 'vitest run' },
			}),
		);
		const workspace = createWorkspacePathProvider(root);
		adopt = await capture(
			buildAdoptProjectToolRegistration({
				namespacePrefix: 'delendai',
				workspace,
				corePaths: {
					cacheDir: '.cache/delendai',
					docsDir: 'docs/delendai',
				},
				reader: createWorkspaceFileReader(workspace),
			}),
		);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('omitting stage installs only the core plugin set (acceptance #1)', async () => {
		const result = parse(await adopt({ analyze: true })) as {
			ok: boolean;
			stage?: string;
			config?: unknown;
		};
		expect(result.ok).toBe(true);
		expect(result.stage).toBe('core');
		const installed = new Set(pluginsOf(result.config));
		// Every installed plugin id must be in the core cumulative set.
		const core = new Set(resolveStagePluginIds('core'));
		for (const id of installed) {
			expect(core.has(id)).toBe(true);
		}
	});

	it('stage="standard" is cumulative over core (acceptance #2)', async () => {
		const core = parse(await adopt({ analyze: true, stage: 'core' })) as {
			config?: unknown;
		};
		const standard = parse(
			await adopt({ analyze: true, stage: 'standard' }),
		) as { stage?: string; config?: unknown };
		expect(standard.stage).toBe('standard');
		const coreIds = new Set(pluginsOf(core.config));
		const standardIds = new Set(pluginsOf(standard.config));
		// Every core id must be present in standard (cumulative).
		for (const id of coreIds) {
			expect(standardIds.has(id)).toBe(true);
		}
		// Standard should include at least one id not in core.
		expect(standardIds.size).toBeGreaterThan(coreIds.size);
	});

	it('stage="specialized" preserves the full assessment set (acceptance #3)', async () => {
		const result = parse(
			await adopt({ analyze: true, stage: 'specialized' }),
		) as { stage?: string; config?: unknown };
		expect(result.stage).toBe('specialized');
		// Specialized should NOT narrow the config — the assessment's
		// remaining recommendations flow through. Assert it equals or
		// exceeds the standard stage.
		const standard = parse(
			await adopt({ analyze: true, stage: 'standard' }),
		) as { config?: unknown };
		const standardIds = new Set(pluginsOf(standard.config));
		const specializedIds = new Set(pluginsOf(result.config));
		for (const id of standardIds) {
			expect(specializedIds.has(id)).toBe(true);
		}
	});

	it('rejects an unknown stage with the default (no error, falls back)', async () => {
		const result = parse(await adopt({ analyze: true, stage: 'premium' }));
		expect((result as { ok: boolean }).ok).toBe(true);
		expect((result as { stage?: string }).stage).toBe('core');
	});

	it('stage filter does not touch the preset (preset is independent)', async () => {
		const core = parse(await adopt({ analyze: true, stage: 'core' })) as {
			preset: string;
		};
		const specialized = parse(
			await adopt({ analyze: true, stage: 'specialized' }),
		) as { preset: string };
		expect(core.preset).toBe(specialized.preset);
	});
});
