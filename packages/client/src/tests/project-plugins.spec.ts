/**
 * project-plugins.spec.ts — f00089 U4.
 *
 * Covers the four behaviours the U4 contract requires:
 *  1. generation from a declarative spec (correct, complete plugin);
 *  2. auto-registration of `plugins.<name>.path` in delendai.config.json;
 *  3. idempotent / non-destructive registration (re-run, existing entries);
 *  4. a plugin spec with several tools.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createProjectPlugin,
	repairProjectPlugin,
	type IProjectPluginSpec,
} from '../public/index';

let workspaceRoot: string;

const readConfig = async (): Promise<{
	plugins?: Record<
		string,
		{ path?: string; prefix?: string; options?: Record<string, unknown> }
	>;
	[k: string]: unknown;
}> => {
	const raw = await readFile(
		join(workspaceRoot, 'delendai.config.json'),
		'utf8',
	);
	return JSON.parse(raw);
};

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'project-plugin-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

describe('createProjectPlugin — generation from spec', () => {
	it('writes a complete plugin package and registers it by path', async () => {
		const spec: IProjectPluginSpec = {
			name: 'acme-notes',
			description: 'Project notes plugin',
			tools: [
				{
					id: 'add',
					description: 'Add a note',
					input: [
						{ name: 'title', type: 'string' },
						{ name: 'pinned', type: 'boolean', optional: true },
					],
					output: [{ name: 'id', type: 'string' }],
				},
			],
		};

		const result = await createProjectPlugin(spec, { workspaceRoot });

		// canonical four files land under the client authoring default layout
		const pkg = await readFile(
			join(result.pluginDir, 'package.json'),
			'utf8',
		);
		expect(JSON.parse(pkg).name).toContain('acme-notes');
		const index = await readFile(
			join(result.pluginDir, 'src/index.ts'),
			'utf8',
		);
		expect(index).toContain('definePlugin');
		expect(index).toContain('OptionsSchema');
		expect(index).toContain('outputSchema');
		expect(index).toContain('_add');
		// no double-nesting
		expect(result.pluginDir).toBe(
			join(
				workspaceRoot,
				'packages/delendai/plugins/delendai_acme-notes',
			),
		);

		// registered by PATH
		const config = await readConfig();
		expect(config.plugins?.['acme-notes']?.path).toBe(
			'./packages/delendai/plugins/delendai_acme-notes/src/index.ts',
		);
		expect(result.registration.action).toBe('added');
		expect(result.tools).toEqual(['acme-notes_add']);
	});

	it('keeps the canonical ping tool when no tools are declared', async () => {
		const result = await createProjectPlugin(
			{ name: 'pinger', description: 'health only' },
			{ workspaceRoot },
		);
		const index = await readFile(
			join(result.pluginDir, 'src/index.ts'),
			'utf8',
		);
		expect(index).toContain('_ping');
		expect(result.tools).toEqual(['pinger_ping']);
	});
});

describe('createProjectPlugin — multiple tools', () => {
	it('emits one registered tool per spec entry with its own schemas', async () => {
		const spec: IProjectPluginSpec = {
			name: 'multi',
			description: 'many tools',
			namespace: 'mx',
			tools: [
				{
					id: 'first',
					description: 'first tool',
					input: [{ name: 'a', type: 'number' }],
					output: [{ name: 'x', type: 'number' }],
				},
				{
					id: 'second',
					description: 'second tool',
					input: [{ name: 'tags', type: 'string[]' }],
				},
			],
		};
		const result = await createProjectPlugin(spec, { workspaceRoot });
		const index = await readFile(
			join(result.pluginDir, 'src/index.ts'),
			'utf8',
		);
		expect(index).toContain('_first');
		expect(index).toContain('_second');
		expect(index).toContain('z.array(z.string())');
		// namespace prefix is applied to the registered names + config
		expect(result.tools).toEqual(['mx_first', 'mx_second']);
		const config = await readConfig();
		expect(config.plugins?.multi?.prefix).toBe('mx');
		expect(config.plugins?.multi?.path).toBe(
			'./packages/delendai/plugins/delendai_multi/src/index.ts',
		);
	});
});

describe('createProjectPlugin — idempotent, non-destructive registration', () => {
	it('is unchanged on a second identical run', async () => {
		const spec: IProjectPluginSpec = {
			name: 'idem',
			description: 'idempotent',
		};
		const first = await createProjectPlugin(spec, {
			workspaceRoot,
			keepLegacy: true,
		});
		expect(first.registration.action).toBe('added');

		const second = await createProjectPlugin(spec, {
			workspaceRoot,
			keepLegacy: true,
		});
		expect(second.registration.action).toBe('unchanged');

		const config = await readConfig();
		expect(Object.keys(config.plugins ?? {})).toEqual(['idem']);
	});

	it('does not clobber unrelated plugin entries or top-level keys', async () => {
		// Seed a config with an existing, unrelated plugin + a top-level key.
		await writeFile(
			join(workspaceRoot, 'delendai.config.json'),
			`${JSON.stringify(
				{
					cacheDir: '.cache/mv',
					plugins: {
						proposals: { prefix: 'work', options: { x: 1 } },
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await createProjectPlugin(
			{ name: 'project-x', description: 'project plugin' },
			{ workspaceRoot },
		);

		const config = await readConfig();
		// existing entry untouched
		expect(config.plugins?.proposals).toEqual({
			prefix: 'work',
			options: { x: 1 },
		});
		// top-level key preserved
		expect(config.cacheDir).toBe('.cache/mv');
		// new entry added alongside
		expect(config.plugins?.['project-x']?.path).toBe(
			'./packages/delendai/plugins/delendai_project-x/src/index.ts',
		);
		expect(Object.keys(config.plugins ?? {}).sort()).toEqual([
			'project-x',
			'proposals',
		]);
	});

	it('updates only the path when an entry with the same name exists', async () => {
		await writeFile(
			join(workspaceRoot, 'delendai.config.json'),
			`${JSON.stringify(
				{
					plugins: {
						widget: {
							prefix: 'wg',
							options: { k: 'v' },
							path: './old/widget.ts',
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		const result = await createProjectPlugin(
			{ name: 'widget', description: 'rebuilt widget' },
			{ workspaceRoot },
		);
		expect(result.registration.action).toBe('updated');
		expect(result.registration.previousPath).toBe('./old/widget.ts');

		const config = await readConfig();
		// prefix + options preserved, only path rewritten
		expect(config.plugins?.widget).toEqual({
			prefix: 'wg',
			options: { k: 'v' },
			path: './packages/delendai/plugins/delendai_widget/src/index.ts',
		});
	});

	it('supports multiple project-specific plugins side by side', async () => {
		await createProjectPlugin(
			{ name: 'alpha', description: 'a' },
			{ workspaceRoot },
		);
		await createProjectPlugin(
			{ name: 'beta', description: 'b' },
			{ workspaceRoot },
		);
		const config = await readConfig();
		expect(Object.keys(config.plugins ?? {}).sort()).toEqual([
			'alpha',
			'beta',
		]);
		expect(config.plugins?.alpha?.path).toBe(
			'./packages/delendai/plugins/delendai_alpha/src/index.ts',
		);
		expect(config.plugins?.beta?.path).toBe(
			'./packages/delendai/plugins/delendai_beta/src/index.ts',
		);
	});
});

describe('repairProjectPlugin', () => {
	it('restores missing scaffold files without overwriting existing files', async () => {
		const spec: IProjectPluginSpec = {
			name: 'repairable',
			description: 'repairable plugin',
		};
		const authored = await createProjectPlugin(spec, { workspaceRoot });
		const indexPath = join(authored.pluginDir, 'src/index.ts');
		const readmePath = join(authored.pluginDir, 'README.md');
		await rm(readmePath);
		await writeFile(
			indexPath,
			'// keep this authored implementation\n',
			'utf8',
		);

		const result = await repairProjectPlugin(spec, { workspaceRoot });

		expect(result.repaired).toContain('README.md');
		expect(result.preserved).toContain('src/index.ts');
		expect(await readFile(indexPath, 'utf8')).toBe(
			'// keep this authored implementation\n',
		);
		expect(result.registration.action).toBe('unchanged');
		expect(result.report).toContain('created 1 missing file');
	});

	it('supports an explicit pluginsRoot using the existing layout', async () => {
		const result = await createProjectPlugin(
			{ name: 'explicit', description: 'explicit root' },
			{ workspaceRoot, pluginsRoot: 'libs/plugins' },
		);

		expect(result.pluginDir).toBe(
			join(workspaceRoot, 'libs/plugins/explicit'),
		);
		expect(result.pluginPath).toBe('./libs/plugins/explicit/src/index.ts');
	});
});

describe('createProjectPlugin — guards', () => {
	it('rejects a non-absolute workspaceRoot', async () => {
		await expect(
			createProjectPlugin(
				{ name: 'x', description: 'y' },
				{ workspaceRoot: 'relative/path' },
			),
		).rejects.toThrow(/absolute path/);
	});
});
