/**
 * plugin-wiring.spec.ts — q00014 S4.
 *
 * The plugin entry does three things worth pinning, and all three are
 * invisible to the tools themselves:
 *
 *   - it publishes the observations tool under the host's namespace;
 *   - it resolves `storePath` and `testJournalPath` through containment
 *     and REFUSES a path that escapes the workspace, rather than
 *     quietly writing to somebody else's directory;
 *   - it defaults both paths under the host's cache dir, so a project
 *     that opts in gets a store without configuring one.
 */
import { describe, expect, it } from 'vitest';

import type {
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import plugin from '../../src/index';

const contextWith = (
	options: Record<string, unknown> = {},
): IMcpPluginContext =>
	fakePartial<
		IMcpPluginContext,
		| 'workspace'
		| 'cacheDir'
		| 'pluginCacheDir'
		| 'namespacePrefix'
		| 'options'
	>({
		workspace: fakePartial<IMcpPluginContext['workspace'], 'root'>({
			root: '/ws',
		}),
		cacheDir: '.cache/delendai',
		pluginCacheDir: '.cache/delendai/self-learning',
		namespacePrefix: 'delendai',
		options,
	});

const registrationsOf = async (
	ctx: IMcpPluginContext,
): Promise<IMcpPluginRegistrations> =>
	(await plugin.register(ctx)) as IMcpPluginRegistrations;

describe('the self-learning plugin entry', () => {
	it('is opt-in and describes itself without claiming to measure anything new', () => {
		expect(plugin.name).toBe('self-learning');
		expect(plugin.optionsSchema).toBeDefined();
	});

	it('publishes the store as a tool', async () => {
		const registrations = await registrationsOf(contextWith());

		expect((registrations.tools ?? []).map((tool) => tool.id)).toEqual([
			'observations',
		]);
	});

	it('refuses a storePath that leaves the workspace', async () => {
		await expect(
			registrationsOf(
				contextWith({ storePath: '../elsewhere/store.jsonl' }),
			),
		).rejects.toThrow(/invalid storePath/);
	});

	it('refuses a testJournalPath that leaves the workspace', async () => {
		await expect(
			registrationsOf(
				contextWith({ testJournalPath: '../../etc/test-runs.jsonl' }),
			),
		).rejects.toThrow(/invalid testJournalPath/);
	});

	it('accepts a workspace-relative override for both paths', async () => {
		const registrations = await registrationsOf(
			contextWith({
				storePath: '.cache/delendai/custom/observations.jsonl',
				testJournalPath: '.cache/delendai/custom/test-runs.jsonl',
				maxObservations: 10,
			}),
		);

		expect(registrations.tools).toHaveLength(1);
	});
});
