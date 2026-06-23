import { describe, expect, it } from 'vitest';

import {
	createWorkspacePluginRootResolver,
	parseVerifyCliArgs,
	type IVerifyCliOptions,
} from './plugin-tool-verify.script';

/**
 * Solid-SRP: the CLI parser is a pure function over its inputs,
 * extracted from `main()` so it can be unit-tested without booting
 * the whole verify script (no fs, no plugins, no process spawn).
 *
 * Every test pins a single piece of the contract; the LSP guard at
 * the bottom proves that any consumer typed against
 * `IVerifyCliOptions` can read every parsed field without casting.
 */
describe('parseVerifyCliArgs (Solid SRP extraction)', () => {
	it('returns an empty options bag for an empty argv', () => {
		expect(parseVerifyCliArgs([])).toEqual({
			pluginFilter: undefined,
			workspace: undefined,
		});
	});

	it('parses `--plugin=<name>` into `pluginFilter`', () => {
		expect(parseVerifyCliArgs(['--plugin=audit'])).toEqual({
			pluginFilter: 'audit',
			workspace: undefined,
		});
	});

	it('parses `--plugin=<name>` even when surrounded by other args', () => {
		expect(
			parseVerifyCliArgs(['--foo', '--plugin=rules', '--bar']),
		).toEqual({
			pluginFilter: 'rules',
			workspace: undefined,
		});
	});

	it('ignores unrelated flags and returns the documented shape', () => {
		expect(parseVerifyCliArgs(['--compact', '--quiet'])).toEqual({
			pluginFilter: undefined,
			workspace: undefined,
		});
	});

	it('takes the LAST `--plugin=` flag when multiple are present (last-write-wins)', () => {
		expect(
			parseVerifyCliArgs(['--plugin=audit', '--plugin=rules']),
		).toEqual({ pluginFilter: 'rules', workspace: undefined });
	});

	it('preserves empty string when `--plugin=` is given with no value', () => {
		expect(parseVerifyCliArgs(['--plugin='])).toEqual({
			pluginFilter: '',
			workspace: undefined,
		});
	});

	it('parses `--workspace=<abs>` so the harness can run from any cwd', () => {
		expect(parseVerifyCliArgs(['--workspace=/abs/repo'])).toEqual({
			pluginFilter: undefined,
			workspace: '/abs/repo',
		});
		expect(
			parseVerifyCliArgs(['--plugin=audit', '--workspace=/abs/repo']),
		).toEqual({ pluginFilter: 'audit', workspace: '/abs/repo' });
	});

	it('LSP: every parsed shape is assignable to IVerifyCliOptions', () => {
		// Solid-LSP guard: a function typed against IVerifyCliOptions
		// accepts every output of parseVerifyCliArgs without casting.
		const consumer = (opts: IVerifyCliOptions): string =>
			opts.pluginFilter ?? 'all';
		expect(consumer(parseVerifyCliArgs([]))).toBe('all');
		expect(consumer(parseVerifyCliArgs(['--plugin=audit']))).toBe('audit');
	});
});

/**
 * r00003 S5 (TS-01, DIP): the plugin loader resolves names against the
 * injected workspace root and contains them with
 * `resolveWorkspaceContained`. A name that escapes the workspace must be
 * rejected before any import, so the harness can be pointed at any root
 * without becoming an arbitrary-file-import vector.
 */
describe('createWorkspacePluginRootResolver (Solid DIP containment)', () => {
	const root = '/abs/repo';

	it('resolves a normal plugin name to an absolute path inside the workspace', () => {
		const resolver = createWorkspacePluginRootResolver(root);
		expect(resolver.resolve('audit')).toBe('/abs/repo/plugins/audit');
	});

	it('rejects a plugin name that escapes the workspace via ../', () => {
		const resolver = createWorkspacePluginRootResolver(root);
		expect(() => resolver.resolve('../../etc/passwd')).toThrow(
			/outside the workspace/,
		);
	});

	it('rejects an absolute plugin name', () => {
		const resolver = createWorkspacePluginRootResolver(root);
		expect(() => resolver.resolve('/etc/evil')).toThrow(
			/outside the workspace/,
		);
	});
});
