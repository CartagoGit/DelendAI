import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	authorExternalPlugin,
	AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA,
	buildAuthorExternalPluginToolRegistration,
	createWorkspacePathProvider,
} from '@mcp-vertex/core/public';

describe('authorExternalPlugin', () => {
	it('accepts only the strict create/repair contract', () => {
		expect(
			AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA.safeParse({ name: 'demo' })
				.success,
		).toBe(true);
		expect(
			AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA.safeParse({
				name: 'demo',
				extra: true,
			}).success,
		).toBe(false);
	});

	it('creates the external layout and config registration', async () => {
		const root = await mkdtemp(join(tmpdir(), 'mcp-vertex-author-'));
		try {
			const result = await authorExternalPlugin(
				{ name: 'Demo Plugin', description: 'Demo.' },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);
			if (
				result.pluginPath === undefined ||
				result.registration === undefined
			) {
				throw new Error(
					'authorExternalPlugin did not return registration data',
				);
			}
			expect(result.pluginPath).toBe(
				'packages/mcp-vertex/plugins/mcp-vertex_demo-plugin/src/index.ts',
			);
			expect(result.registration.action).toBe('added');
			expect(await stat(join(root, result.pluginPath))).toBeTruthy();
			const config = JSON.parse(
				await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
			) as { plugins: Record<string, { path: string }> };
			const registered = config.plugins['demo-plugin'];
			if (registered === undefined) {
				throw new Error('demo-plugin registration was not written');
			}
			expect(registered.path).toBe(result.pluginPath);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('dry-run returns a plan without writing', async () => {
		const root = await mkdtemp(join(tmpdir(), 'mcp-vertex-author-'));
		try {
			const result = await authorExternalPlugin(
				{ name: 'demo', dryRun: true },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);
			if (result.registration === undefined) {
				throw new Error(
					'authorExternalPlugin did not return registration data',
				);
			}
			expect(result.files?.planned.length).toBeGreaterThan(0);
			expect(result.registration.action).toBe('added');
			expect(result.files?.written).toHaveLength(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('inspect reports structural defects without modifying the plugin', async () => {
		const root = await mkdtemp(join(tmpdir(), 'mcp-vertex-author-'));
		try {
			const created = await authorExternalPlugin(
				{ name: 'broken', description: 'Broken.' },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);
			const indexPath = join(created.pluginDir as string, 'src/index.ts');
			const customEntrypoint = "export default { name: 'broken' };\n";
			await writeFile(indexPath, customEntrypoint);

			const inspected = await authorExternalPlugin(
				{ name: 'broken', mode: 'inspect' },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);

			expect(inspected.ok).toBe(false);
			expect(
				inspected.diagnostics?.some(
					(item) => item.id === 'define-plugin',
				),
			).toBe(true);
			expect(await readFile(indexPath, 'utf8')).toBe(customEntrypoint);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('repair fixes metadata and missing files while preserving project logic', async () => {
		const root = await mkdtemp(join(tmpdir(), 'mcp-vertex-author-'));
		try {
			const created = await authorExternalPlugin(
				{ name: 'repairable', description: 'Repairable.' },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);
			const pluginDir = created.pluginDir as string;
			const indexPath = join(pluginDir, 'src/index.ts');
			const customEntrypoint = await readFile(indexPath, 'utf8');
			await writeFile(
				indexPath,
				`${customEntrypoint}\n// project-specific logic\n`,
			);
			await writeFile(
				join(pluginDir, 'package.json'),
				JSON.stringify({ name: 'repairable', main: './wrong.js' }),
			);
			await rm(join(pluginDir, 'README.md'));

			const repaired = await authorExternalPlugin(
				{ name: 'repairable', mode: 'repair' },
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(root),
				},
			);

			expect(repaired.autoFixed).toContain(
				'missing-plugins/repairable/README.md',
			);
			expect(repaired.autoFixed).toContain('package-main');
			expect(await readFile(indexPath, 'utf8')).toContain(
				'// project-specific logic',
			);
			expect(
				JSON.parse(
					await readFile(join(pluginDir, 'package.json'), 'utf8'),
				),
			).toMatchObject({
				main: './src/index.ts',
				type: 'module',
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('registers a typed MCP handler', async () => {
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const registration = buildAuthorExternalPluginToolRegistration({
			namespacePrefix: 'mcp-vertex',
			workspace: createWorkspacePathProvider('/tmp'),
		});
		await registration.register({
			registerTool(
				_name: string,
				_definition: unknown,
				callback: unknown,
			) {
				handler = callback as (args: unknown) => Promise<unknown>;
			},
		} as never);
		expect(handler).toBeTypeOf('function');
	});
});
