/**
 * options-validation.spec.ts
 *
 * r00003 S9-residual (L + I): pin the contract that `register()`
 * uses `OptionsSchema.safeParse()` instead of casting `ctx.options`
 * as `IConventionOverrides`. The schema is the single source of
 * truth for what the host is allowed to configure; bypassing it with
 * a cast silently accepts typos, unknown fields and wrong types.
 */

import { describe, expect, it } from 'vitest';

import testConventionPlugin from '../../../src/index';

describe('test-convention plugin — options validation (r00003 S9-residual)', () => {
	it('register() succeeds when ctx.options is empty (defaults applied)', async () => {
		const ctx = {
			workspace: { root: '/tmp', resolve: (r: string) => r },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: '.cache/test-convention',
			pluginDocsDir: 'docs/test-convention',
			namespacePrefix: 'mcp-vertex',
			options: {},
			args: {},
		};
		const result = await testConventionPlugin.register(ctx as never);
		expect(result.tools).toHaveLength(3);
	});

	it('register() succeeds when ctx.options carries valid fields', async () => {
		const ctx = {
			workspace: { root: '/tmp', resolve: (r: string) => r },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: '.cache/test-convention',
			pluginDocsDir: 'docs/test-convention',
			namespacePrefix: 'mcp-vertex',
			options: {
				specExtension: '.spec.ts',
				mockStyle: 'vi' as const,
				requireDescribe: true,
			},
			args: {},
		};
		const result = await testConventionPlugin.register(ctx as never);
		expect(result.tools).toHaveLength(3);
	});

	it('register() throws on invalid options (unknown enum value)', async () => {
		const ctx = {
			workspace: { root: '/tmp', resolve: (r: string) => r },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: '.cache/test-convention',
			pluginDocsDir: 'docs/test-convention',
			namespacePrefix: 'mcp-vertex',
			options: {
				// mockStyle is `vi | jest | auto`; `mocha` is rejected by
				// the schema but was silently accepted by the old
				// `as IConventionOverrides` cast.
				mockStyle: 'mocha',
			},
			args: {},
		};
		let caught: unknown = null;
		try {
			await testConventionPlugin.register(ctx as never);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toMatch(
			/test-convention plugin rejected its options/,
		);
	});

	it('register() throws on out-of-range coverageThreshold.lines', async () => {
		const ctx = {
			workspace: { root: '/tmp', resolve: (r: string) => r },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: '.cache/test-convention',
			pluginDocsDir: 'docs/test-convention',
			namespacePrefix: 'mcp-vertex',
			options: {
				coverageThreshold: { lines: 150 }, // schema caps at 100
			},
			args: {},
		};
		let caught: unknown = null;
		try {
			await testConventionPlugin.register(ctx as never);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toMatch(/rejected its options/);
	});

	it('does NOT use the bare `as IConventionOverrides` cast anymore', async () => {
		// Sanity check: ensure the unsafe cast is no longer present in
		// the source. If a future refactor re-introduces it, this test
		// fails loudly.
		const fs = await import('node:fs/promises');
		const src = await fs.readFile(
			new URL('../../../src/index.ts', import.meta.url),
			'utf8',
		);
		expect(src).not.toMatch(/ctx\.options\s+as\s+IConventionOverrides/);
	});
});
