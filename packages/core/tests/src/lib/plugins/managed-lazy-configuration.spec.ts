/**
 * managed-lazy-configuration.spec.ts — a lazy start imports only the
 * plugins its configuration check needs, and still fails on a bad one.
 */
import z from 'zod';
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';
import type { IManagedLazyPluginCatalogEntry } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';
import { validateManagedLazyConfiguration } from '@delendai/core/lib/plugins/managed-lazy-runtime';

const entry = (
	id: string,
	startupCheck?: boolean,
): IManagedLazyPluginCatalogEntry => ({
	id,
	packageSpecifier: `@test/${id}`,
	toolIds: [],
	promptIds: [],
	resourceIds: [],
	knowledgeIds: [],
	skillIds: [],
	dependencies: [],
	...(startupCheck === undefined ? {} : { startupCheck }),
});

const plugin = (name: string, extra: Record<string, unknown> = {}) => ({
	default: {
		name,
		version: '0.0.0',
		register: () => ({}),
		optionsSchema: z.object({ level: z.number().optional() }).strict(),
		...extra,
	},
});

const check = async (
	configured: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
	extras: Readonly<Record<string, Record<string, unknown>>> = {},
) => {
	const imported: string[] = [];
	const result = await validateManagedLazyConfiguration({
		plugins: [entry('quiet'), entry('configured'), entry('checker', true)],
		buildContext: (name) =>
			fakePartial<IMcpPluginContext>({ options: configured[name] ?? {} }),
		pluginOptions: new Map(Object.entries(configured)),
		enabledPlugins: ['quiet', 'configured', 'checker'],
		importFn: async (specifier) => {
			imported.push(specifier);
			const name = specifier.replace('@test/', '');
			return plugin(name, extras[name]);
		},
	});
	return { imported, result };
};

describe('validateManagedLazyConfiguration', () => {
	it('imports a configured plugin and one that checks the configuration, not one with nothing to check', async () => {
		const { imported, result } = await check({ configured: { level: 1 } });
		expect(imported).toEqual(['@test/configured', '@test/checker']);
		expect(result.failures).toEqual([]);
	});

	it('still fails at start-up on a configured plugin whose options it rejects', async () => {
		const { result } = await check({ configured: { level: 'high' } });
		expect(result.failures.map((failure) => failure.specifier)).toEqual([
			'configured',
		]);
	});

	it('runs the configuration check of the plugin that declares one', async () => {
		const { result } = await check(
			{},
			{
				checker: {
					validateConfiguration: () => [
						{
							code: 'conflict',
							message: 'refused',
							keys: ['level'],
						},
					],
				},
			},
		);
		expect(result.issues.join('\n')).toContain('refused');
	});
});
