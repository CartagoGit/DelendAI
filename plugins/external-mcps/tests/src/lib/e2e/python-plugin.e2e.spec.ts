/**
 * python-plugin.e2e.spec.ts — the worked example of a plugin in another
 * language, run for real: delendai judges its manifest, boots the Python
 * MCP server it declares, and routes a call to its tool.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import plugin from '../../../../src/index';

import { manifestPluginOf } from '../../../../src/lib/catalog/manifest-plugin.service';
import { OptionsSchema } from '../../../../src/lib/options-schema';
import {
	ExternalServerRegistry,
	type IRegistryServerEntry,
} from '../../../../src/lib/subprocess/server-registry';

const ROOT = resolve(import.meta.dirname, '../../../../../..');
const EXAMPLE = join(ROOT, 'docs/delendai/examples/python-plugin');
const hasPython = spawnSync('python3', ['--version']).status === 0;

const declared = (): IRegistryServerEntry => {
	const config = JSON.parse(
		readFileSync(join(EXAMPLE, 'delendai.config.json'), 'utf8'),
	) as { plugins: { 'external-mcps': { options: unknown } } };
	const options = OptionsSchema.parse(
		config.plugins['external-mcps'].options,
	);
	const greeter = options.servers?.greeter;
	if (greeter === undefined)
		throw new Error('the example declares no greeter');
	return greeter;
};

describe.skipIf(!hasPython)('a plugin written in Python', () => {
	let registry: ExternalServerRegistry | undefined;
	afterEach(() => registry?.closeAll());

	it('is judged by its manifest and answers a call through delendai', async () => {
		const entry = declared();
		const plugin = await manifestPluginOf({
			workspaceRoot: ROOT,
			entry,
			read: (path) => {
				try {
					return readFileSync(path, 'utf8');
				} catch {
					return undefined;
				}
			},
		});
		expect(plugin.kind).toBe('plugin');
		expect(plugin.kind === 'plugin' && plugin.manifest.package).toBe(
			'greeter-mcp',
		);
		registry = new ExternalServerRegistry({
			servers: { greeter: entry },
			workspaceRoot: ROOT,
		});
		const outcome = await registry.call('greeter', 'greet', {
			name: 'Ada',
		});
		expect(outcome).toEqual({
			ok: true,
			result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
		});
	});

	it('ships its agent roles like a TypeScript plugin, named after the server', async () => {
		const config = JSON.parse(
			readFileSync(join(EXAMPLE, 'delendai.config.json'), 'utf8'),
		) as {
			plugins: { 'external-mcps': { options: Record<string, unknown> } };
		};
		const runtime = await plugin.register(
			fakePartial<Parameters<typeof plugin.register>[0]>({
				options: config.plugins['external-mcps'].options,
				namespacePrefix: 'ext',
				pluginCacheDir: '.cache/delendai/external-mcps',
				workspace: fakePartial<
					Parameters<typeof plugin.register>[0]['workspace']
				>({
					root: ROOT,
					resolve: (path: string) => join(ROOT, path),
				}),
			}),
		);
		const registrations =
			'registrations' in runtime ? runtime.registrations : runtime;
		expect(registrations.agentRoles?.map((role) => role.role)).toEqual([
			'greeter-host',
		]);
		if ('dispose' in runtime) await runtime.dispose?.();
	});
});
