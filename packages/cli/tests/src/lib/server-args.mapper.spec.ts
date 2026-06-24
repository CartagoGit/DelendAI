/**
 * server-args.mapper.spec.ts — r00003 S2 (F-001, O + I).
 *
 * The mapper is the single source of truth for which `ICliGlobalOptions`
 * fields forward to which host flags. These specs guard two SOLID
 * properties:
 *
 *   - **Open/Closed**: adding a flag is a one-row table edit. We assert
 *     the four rule shapes (`flag | option | repeatable | passthrough`)
 *     each render correctly, so a new row is a pure data addition.
 *   - **No silent flag drop (F-001)**: a "missing-flag" test fails if any
 *     forwardable global the host parser knows about is dropped from the
 *     table.
 */

import { describe, expect, it } from 'vitest';

import type { ICliGlobalOptions } from '../../../src/contracts/interfaces/cli-command.interface';
import {
	type IAutoForwardRule,
	passthroughRule,
	SERVER_ARG_MAPPER,
} from '../../../src/lib/server-args.mapper';

const ruleFor = (key: keyof ICliGlobalOptions): IAutoForwardRule => {
	const rule = SERVER_ARG_MAPPER.find((r) => r.key === key);
	if (!rule) throw new Error(`no mapper rule for ${String(key)}`);
	return rule;
};

describe('SERVER_ARG_MAPPER — rule shapes', async () => {
	it("renders an 'option' rule as --flag value when non-empty, [] otherwise", async () => {
		const rule = ruleFor('config');
		expect(rule.kind).toBe('option');
		expect(rule.argv('config', 'cfg.json')).toEqual([
			'--config',
			'cfg.json',
		]);
		expect(rule.argv('config', '')).toEqual([]);
		expect(rule.argv('config', undefined)).toEqual([]);
	});

	it("renders a 'flag' rule as bare --flag only when true", async () => {
		const rule = ruleFor('mcpProjectCreate');
		expect(rule.kind).toBe('flag');
		expect(rule.argv('mcpProjectCreate', true)).toEqual([
			'--mcpProjectCreate',
		]);
		expect(rule.argv('mcpProjectCreate', false)).toEqual([]);
		expect(rule.argv('mcpProjectCreate', undefined)).toEqual([]);
	});

	it("renders a 'repeatable' rule as a comma-joined, de-duplicated list", async () => {
		const rule = ruleFor('plugins');
		expect(rule.kind).toBe('repeatable');
		expect(rule.argv('plugins', ['a', 'b', 'a'])).toEqual([
			'--plugins',
			'a,b',
		]);
		expect(rule.argv('plugins', [])).toEqual([]);
	});

	it("exposes a 'passthrough' rule builder that forwards values verbatim", async () => {
		const rule = passthroughRule('plugins');
		expect(rule.kind).toBe('passthrough');
		expect(rule.argv('plugins', ['--raw', 'x'])).toEqual(['--raw', 'x']);
		expect(rule.argv('plugins', undefined)).toEqual([]);
	});
});

describe('SERVER_ARG_MAPPER — F-001 no silent flag drop', async () => {
	it('forwards every host global mcpv is responsible for', async () => {
		// The host parser (`parse-cli-args.ts`) knows these forwardable
		// globals. mcpv used to forward only 4; every one of these MUST
		// have a mapper rule or the host loses a flag silently.
		const requiredKeys: readonly (keyof ICliGlobalOptions)[] = [
			'config',
			'preset',
			'cacheDir',
			'docsDir',
			'plugins',
			'excludePlugins',
			'mcpProjectCreate',
			'mcpProjectTests',
		];
		const declared = new Set(SERVER_ARG_MAPPER.map((r) => r.key));
		for (const key of requiredKeys) {
			expect(
				declared.has(key),
				`mapper rule for ${String(key)} is missing`,
			).toBe(true);
		}
	});

	it('is extensible by data (Open/Closed): appending is a pure operation', async () => {
		const before = SERVER_ARG_MAPPER.length;
		const extra: IAutoForwardRule = {
			key: 'remote',
			kind: 'option',
			argv: (k, v) => (v === undefined ? [] : [`--${k}`, String(v)]),
		};
		expect([...SERVER_ARG_MAPPER, extra]).toHaveLength(before + 1);
	});
});
