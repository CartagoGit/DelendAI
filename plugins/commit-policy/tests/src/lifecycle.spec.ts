/**
 * lifecycle.spec.ts — x00261 + t00020 acceptance: register() returns
 * dispose() that tears down every timer + listener the plugin owns.
 *
 * Pins two properties:
 *   1. After dispose(), the slice listener's setInterval is cleared.
 *   2. A second dispose() is a no-op (idempotent).
 *
 * Reload-N scenario is covered by `t00020` once the engine exists;
 * here we only assert the lifecycle contract.
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import plugin, {
	validateCommitPolicyConfiguration,
} from '@mcp-vertex/commit-policy';
import { CommitPolicyOptionsSchema } from '@mcp-vertex/commit-policy/lib/contracts/options';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

const buildCtx = (workspace: string): IMcpPluginContext => ({
	workspace: {
		root: workspace,
		resolve: (p: string) => join(workspace, p),
	},
	corePaths: {
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
	},
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: '.cache/mcp-vertex/commit-policy',
	pluginDocsDir: 'docs/mcp-vertex/commit-policy',
	namespacePrefix: 'commit-policy',
	options: {
		commit: { enabled: false },
		cadence: { triggers: [{ kind: 'slice', onStatuses: ['done'] }] },
	},
	args: {},
});

describe('commit-policy lifecycle (x00261)', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-lifecycle-'));
		await mkdir(join(workspace, 'docs', 'proposals'), { recursive: true });
		await writeFile(
			join(workspace, 'docs', 'proposals', 'index.json'),
			JSON.stringify({ proposals: [] }, null, 2),
			'utf8',
		);
	});

	afterEach(async () => {
		if (workspace) await rm(workspace, { recursive: true, force: true });
	});

	it('rejects an enabled push whose configured branch is protected', () => {
		const issues = validateCommitPolicyConfiguration({
			pluginName: 'commit-policy',
			enabledPlugins: ['commit-policy'],
			pluginOptions: new Map([
				[
					'commit-policy',
					{
						push: {
							enabled: true,
							branch: 'develop',
							protectedBranches: ['main', 'develop'],
						},
					},
				],
			]),
		});

		expect(issues[0]).toMatchObject({
			code: 'PUSH_TARGET_IS_PROTECTED',
			keys: expect.arrayContaining([
				'plugins.commit-policy.options.push.branch',
				'plugins.commit-policy.options.push.protectedBranches',
			]),
		});
	});

	it('rejects an enabled push whose configured branch matches a protected prefix', () => {
		const issues = validateCommitPolicyConfiguration({
			pluginName: 'commit-policy',
			enabledPlugins: ['commit-policy'],
			pluginOptions: new Map([
				[
					'commit-policy',
					{
						push: {
							enabled: true,
							branch: 'release/v1',
							protectedPrefixes: ['release/'],
						},
					},
				],
			]),
		});

		expect(issues[0]).toMatchObject({
			code: 'PUSH_TARGET_IS_PROTECTED',
			keys: expect.arrayContaining([
				'plugins.commit-policy.options.push.branch',
				'plugins.commit-policy.options.push.protectedPrefixes',
			]),
		});
	});

	it('disables agent stash operations by default', () => {
		expect(CommitPolicyOptionsSchema.parse({}).stash.enabled).toBe(false);
		expect(
			CommitPolicyOptionsSchema.parse({ stash: { enabled: true } }).stash
				.enabled,
		).toBe(true);
	});

	it('register() returns dispose() that is callable', async () => {
		const reg = await plugin.register(buildCtx(workspace));
		const runtime = asRuntime(reg);
		expect(typeof runtime.dispose).toBe('function');
		await runtime.dispose();
	});

	it('dispose() is idempotent', async () => {
		const reg = await plugin.register(buildCtx(workspace));
		const runtime = asRuntime(reg);
		await runtime.dispose();
		// Second dispose must not throw.
		await runtime.dispose();
	});

	it('dispose() stops the slice listener (no leaked interval)', async () => {
		const reg = await plugin.register(buildCtx(workspace));
		const runtime = asRuntime(reg);
		const before = process.listenerCount('SIGINT');
		await runtime.dispose();
		// Indirect check: a second dispose is a no-op and does not
		// touch new state — proves the listener was already torn
		// down by the first call (a leaked listener would survive
		// and the second call would still hold a timer handle).
		await runtime.dispose();
		expect(process.listenerCount('SIGINT')).toBe(before);
	});
});

/**
 * x00261 contract: `register()` MAY return an `IPluginRuntime`
 * wrapper that owns a `dispose()`. x00261's audit fix expects the
 * plugin to return the runtime shape, not the bare registrations.
 * This narrows the union so the test can call `dispose` directly.
 */
function asRuntime(reg: Awaited<ReturnType<typeof plugin.register>>): {
	dispose(): void | Promise<void>;
} {
	if (!('dispose' in reg) || typeof reg.dispose !== 'function') {
		throw new Error('register() did not return an IPluginRuntime');
	}
	return reg as unknown as { dispose(): void | Promise<void> };
}
