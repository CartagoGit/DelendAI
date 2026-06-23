import { describe, expect, it } from 'vitest';

import {
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
		expect(parseVerifyCliArgs([])).toEqual({ pluginFilter: undefined });
	});

	it('parses `--plugin=<name>` into `pluginFilter`', () => {
		expect(parseVerifyCliArgs(['--plugin=audit'])).toEqual({
			pluginFilter: 'audit',
		});
	});

	it('parses `--plugin=<name>` even when surrounded by other args', () => {
		expect(
			parseVerifyCliArgs(['--foo', '--plugin=rules', '--bar']),
		).toEqual({
			pluginFilter: 'rules',
		});
	});

	it('ignores unrelated flags and returns the documented shape', () => {
		expect(parseVerifyCliArgs(['--compact', '--quiet'])).toEqual({
			pluginFilter: undefined,
		});
	});

	it('takes the LAST `--plugin=` flag when multiple are present (last-write-wins)', () => {
		expect(
			parseVerifyCliArgs(['--plugin=audit', '--plugin=rules']),
		).toEqual({ pluginFilter: 'rules' });
	});

	it('preserves empty string when `--plugin=` is given with no value', () => {
		expect(parseVerifyCliArgs(['--plugin='])).toEqual({ pluginFilter: '' });
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
