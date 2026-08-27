/**
 * dispose.spec.ts — AUD-D05: `register()` must return a `dispose` that
 * closes every subprocess `ExternalServerRegistry` booted, so the host's
 * teardown chain (`McpHostSession.dispose()`, r00039) has something to
 * call. Before this fix `grep -n "dispose" plugins/external-mcps/src/index.ts`
 * matched nothing at all — `ExternalServerRegistry.closeAll()` existed but
 * nobody outside the plugin module could ever reach it.
 *
 * `ExternalServerRegistry`'s own SIGTERM/SIGKILL-grace/idempotency
 * behaviour (including against a real spawned child) is already covered
 * end to end in `server-registry.spec.ts`'s "close semantics" suite; this
 * file only proves the PLUGIN wires its `dispose` through to that
 * registry's `closeAll()` at all — the exact gap AUD-D05 found.
 */
import { describe, expect, it } from 'vitest';

import plugin from '../../../src/index';

/** Unwrap `register()`'s `{ registrations, dispose }` runtime shape. */
const asRuntime = (
	reg: Awaited<ReturnType<typeof plugin.register>>,
): { dispose?: () => Promise<void> | void } =>
	reg as unknown as { dispose?: () => Promise<void> | void };

describe('external-mcps plugin dispose (AUD-D05)', () => {
	it('register() returns a dispose function', async () => {
		const reg = await plugin.register({
			options: {},
			args: {},
			namespacePrefix: 'external-mcps',
			pluginCacheDir: 'external-mcps',
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			workspace: {
				root: '/tmp/external-mcps-dispose-spec',
				resolve: (rel: string) =>
					`/tmp/external-mcps-dispose-spec/${rel}`,
			},
		} as never);
		expect(typeof asRuntime(reg).dispose).toBe('function');
	});

	it('dispose() is idempotent: a second call is a safe no-op', async () => {
		const reg = await plugin.register({
			options: {},
			args: {},
			namespacePrefix: 'external-mcps',
			pluginCacheDir: 'external-mcps',
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			workspace: {
				root: '/tmp/external-mcps-dispose-spec',
				resolve: (rel: string) =>
					`/tmp/external-mcps-dispose-spec/${rel}`,
			},
		} as never);
		const runtime = asRuntime(reg);
		await expect(runtime.dispose?.()).resolves.toBeUndefined();
		await expect(runtime.dispose?.()).resolves.toBeUndefined();
	});
});
