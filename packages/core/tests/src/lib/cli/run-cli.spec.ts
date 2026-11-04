/**
 * run-cli.spec.ts: the helpers of the `delendai` bin entry. Merges the
 * former verbose.spec.ts and blueprint-cachedir.spec.ts (the blueprint
 * must land under the resolved cacheDir, M15/H5) with the startup
 * preset migration, which must run with or without an explicit --config.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildAssemblyDiagnostics,
	formatVerbose,
	migratePresetOnStart,
	prepareServerBlueprintOnStart,
} from '@delendai/core/lib/cli/run-cli';
import type { IDelendaiHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';
import type { IDelendaiProjectMetadata } from '@delendai/core/lib/contracts/interfaces/project-metadata.interface';
import type {
	IPromptRegistration,
	IToolRegistration,
} from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';
import type { IMcpPlugin } from '@delendai/core/lib/plugins/plugin-contract';
import type {
	ILoadedPlugin,
	IPluginLoadResult,
} from '@delendai/core/lib/plugins/load-plugins';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

const verboseArgs = parseCliArgs(
	[
		'--plugins=demo,other',
		'--workspace=/ws',
		'--cacheDir=.c',
		'--docsDir=.d',
	],
	'/cwd',
);

const loadResult = fakePartial<IPluginLoadResult>({
	loaded: [
		fakePartial<ILoadedPlugin>({
			plugin: fakePartial<IMcpPlugin>({ name: 'demo', version: '1.2.3' }),
			registrations: {},
		}),
		fakePartial<ILoadedPlugin>({
			plugin: fakePartial<IMcpPlugin>({ name: 'other' }),
			registrations: {},
		}),
	],
	errors: [{ specifier: 'broken', message: 'boom' }],
});

const config = fakePartial<IDelendaiHostConfig>({
	metadata: fakePartial<IDelendaiProjectMetadata>({
		name: 's',
		version: '0',
	}),
	namespacePrefix: 'delendai',
	extraTools: ['a', 'b', 'c'].map((id) =>
		fakePartial<IToolRegistration>({ id }),
	),
	extraPrompts: [fakePartial<IPromptRegistration>({ id: 'p' })],
	extraResources: [],
});

describe('--verbose diagnostics (N23)', async () => {
	it('buildAssemblyDiagnostics snapshots plugins, counts and order', async () => {
		const d = buildAssemblyDiagnostics(verboseArgs, loadResult, config, [
			'delendai_overview',
			'demo_x',
		]);
		expect(d.workspace).toBe('/ws');
		expect(d.cacheDir).toBe('.c');
		expect(d.plugins.requested).toEqual(['demo', 'other']);
		expect(d.plugins.loaded).toEqual([
			{ name: 'demo', version: '1.2.3' },
			{ name: 'other' },
		]);
		expect(d.plugins.errors).toEqual(['boom']);
		expect(d.counts).toEqual({ tools: 3, prompts: 1, resources: 0 });
		expect(d.registrationOrder).toEqual(['delendai_overview', 'demo_x']);
	});

	it('formatVerbose renders stderr lines with version + counts + order', async () => {
		const out = formatVerbose(
			buildAssemblyDiagnostics(verboseArgs, loadResult, config, ['t1']),
		);
		expect(out).toContain('[delendai] verbose:');
		expect(out).toContain('loaded=[demo@1.2.3, other]');
		expect(out).toContain('errors=1');
		expect(out).toContain('tools=3 prompts=1 resources=0');
		expect(out).toContain('registrationOrder=[t1]');
		expect(out.endsWith('\n')).toBe(true);
	});
});

describe('prepareServerBlueprintOnStart cacheDir (M15/H5)', async () => {
	let ws = '';
	beforeEach(() => {
		ws = mkdtempSync(join(tmpdir(), 'bp-cache-'));
	});
	afterEach(() => rmSync(ws, { recursive: true, force: true }));

	it('writes under the resolved cacheDir (e.g. from config), not the default', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state');
		expect(res.written).toBe(true);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('falls back to the default cacheDir when none is resolved', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args);
		expect(res.path).toBe('.cache/delendai/bootstrap/blueprint.json');
	});

	it('collapses trailing slashes in the resolved cacheDir path', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state///');
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('handles a long trailing slash run in cacheDir quickly', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const started = Date.now();
		const res = await prepareServerBlueprintOnStart(
			args,
			`build/state${'/'.repeat(40_000)}`,
		);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});

describe('migratePresetOnStart', () => {
	const roots: string[] = [];
	const workspace = async (): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), 'preset-on-start-'));
		roots.push(root);
		return root;
	};
	afterEach(async () => {
		await Promise.all(
			roots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	const lean = JSON.stringify({
		plugins: { docs: {}, git: {}, memory: {}, search: {} },
	});

	it('runs with an explicit relative --config, the way consumers launch it', async () => {
		const root = await workspace();
		await writeFile(join(root, 'custom.config.json'), lean);
		const result = await migratePresetOnStart({
			workspace: root,
			configPath: 'custom.config.json',
		});
		expect(result.outcome).toBe('recorded');
		const journal = await readFile(
			join(root, '.cache/delendai/preset-migration.jsonl'),
			'utf8',
		);
		expect(JSON.parse(journal.trim())).toMatchObject({ retired: 'lean' });
		expect(await readFile(join(root, 'custom.config.json'), 'utf8')).toBe(
			lean,
		);
	});

	it('runs with an absolute --config and with the default config', async () => {
		const root = await workspace();
		await writeFile(join(root, 'delendai.config.json'), lean);
		expect((await migratePresetOnStart({ workspace: root })).outcome).toBe(
			'recorded',
		);
		const other = await workspace();
		const path = join(other, 'abs.json');
		await writeFile(path, lean);
		expect(
			(await migratePresetOnStart({ workspace: other, configPath: path }))
				.outcome,
		).toBe('recorded');
	});

	it('does nothing without a config', async () => {
		expect(
			(await migratePresetOnStart({ workspace: await workspace() }))
				.outcome,
		).toBe('unchanged');
	});
});
