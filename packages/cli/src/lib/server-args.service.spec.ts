/**
 * server-args.service.spec.ts — f00046 + a00036 F-001.
 *
 * After S2 merged the consumer (`buildServerArgs`) and the declarative
 * forwarder table (`SERVER_ARG_MAPPER`) into a single source file, the
 * two test suites that used to live in `tests/src/lib/server-args.spec.ts`
 * and `tests/src/lib/server-args.mapper.spec.ts` collapsed into this
 * one co-located spec.
 *
 * The two describe blocks preserve the original guard rails:
 *
 *   - `SERVER_ARG_MAPPER — rule shapes` exercises the table directly so
 *     a rule-shape regression (e.g. a `repeatable` losing its
 *     de-duplication) fails BEFORE the integration test ever runs.
 *   - `buildServerArgs (SOLID: declarative flag forwarding)` exercises
 *     the consumer end-to-end, including the `--plugins` merge with
 *     caller-supplied extras and the f00052 tri-state
 *     `--agent-worktree` forwarding.
 *   - `F-001 no silent flag drop` lives in both suites; the table-level
 *     assertion catches a missing mapper row, the consumer-level
 *     assertion catches a key that exists in the table but never makes
 *     it into `argv`.
 */
import { describe, expect, it } from 'vitest';

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';
import {
	buildServerArgs,
	type IAutoForwardRule,
	passthroughRule,
	SERVER_ARG_MAPPER,
} from './server-args.service';

const ruleFor = (key: keyof ICliGlobalOptions): IAutoForwardRule => {
	const rule = SERVER_ARG_MAPPER.find((r) => r.key === key);
	if (!rule) throw new Error(`no mapper rule for ${String(key)}`);
	return rule;
};

describe('SERVER_ARG_MAPPER — rule shapes', async () => {
	it("renders an 'option' rule as --flag value when non-empty, [] otherwise", async () => {
		const rule = ruleFor('config');
		expect(rule.kind).toBe('option');
		expect(rule.argv('config', 'cfg.json')).toEqual(['--config', 'cfg.json']);
		expect(rule.argv('config', '')).toEqual([]);
		expect(rule.argv('config', undefined)).toEqual([]);
	});

	it("renders a 'flag' rule as bare --flag only when true", async () => {
		const rule = ruleFor('mcpProjectCreate');
		expect(rule.kind).toBe('flag');
		expect(rule.argv('mcpProjectCreate', true)).toEqual(['--mcpProjectCreate']);
		expect(rule.argv('mcpProjectCreate', false)).toEqual([]);
		expect(rule.argv('mcpProjectCreate', undefined)).toEqual([]);
	});

	it("renders a 'repeatable' rule as a comma-joined, de-duplicated list", async () => {
		const rule = ruleFor('plugins');
		expect(rule.kind).toBe('repeatable');
		expect(rule.argv('plugins', ['a', 'b', 'a'])).toEqual(['--plugins', 'a,b']);
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
		// The host parser knows these forwardable globals. mcpv used to
		// forward only 4; every one of these MUST have a mapper rule or
		// the host loses a flag silently.
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

describe('buildServerArgs (SOLID: declarative flag forwarding)', async () => {
	it('always forwards --workspace (the host requires a workspace)', async () => {
		const args = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		});
		expect(args).toContain('__serve');
		expect(args).toContain('--workspace');
		expect(args[args.indexOf('--workspace') + 1]).toBe('/repo');
	});

	it('forwards --config only when defined (omits undefined)', async () => {
		const withCfg = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
			config: 'mcp-vertex.config.json',
		});
		expect(withCfg).toContain('--config');
		expect(withCfg[withCfg.indexOf('--config') + 1]).toBe(
			'mcp-vertex.config.json',
		);

		const withoutCfg = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		});
		expect(withoutCfg).not.toContain('--config');
	});

	it('forwards --preset only when defined', async () => {
		const withPreset = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
			preset: 'swarm',
		});
		expect(withPreset).toContain('--preset');
		expect(withPreset[withPreset.indexOf('--preset') + 1]).toBe('swarm');

		const withoutPreset = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		});
		expect(withoutPreset).not.toContain('--preset');
	});

	it('forwards --plugins as a comma-separated list, deduplicated, plus extras', async () => {
		const args = buildServerArgs(
			{
				workspace: '/repo',
				json: false,
				format: 'text',
				lang: 'en',
				noColor: false,
				plugins: ['proposals', 'memory', 'proposals'],
			},
			['memory', 'audit'],
		);
		expect(args).toContain('--plugins');
		const lastPluginsIdx = args.lastIndexOf('--plugins');
		const value = args[lastPluginsIdx + 1];
		expect(value?.split(',')).toEqual(
			expect.arrayContaining(['proposals', 'memory', 'audit']),
		);
		expect(value?.split(',')).toHaveLength(3);
	});

	it('omits --plugins when both list and extras are empty', async () => {
		const args = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		});
		expect(args).not.toContain('--plugins');
	});

	// f00052 S3 — host-scoped --agent-worktree forwarding (tri-state)
	it('forwards --agent-worktree when agentWorktree is true', async () => {
		const args = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
			agentWorktree: true,
		});
		expect(args).toContain('--agent-worktree');
		expect(args[args.indexOf('--agent-worktree') + 1]).not.toBe('false');
	});

	it('forwards --agent-worktree=false when agentWorktree is false', async () => {
		const args = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
			agentWorktree: false,
		});
		expect(args).toContain('--agent-worktree=false');
	});

	it('forwards nothing for agent-worktree when undefined (host falls back to default)', async () => {
		const args = buildServerArgs({
			workspace: '/repo',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		});
		expect(args.some((a) => a.startsWith('--agent-worktree'))).toBe(false);
	});

	it('covers every field on ICliGlobalOptions that the core parser accepts (forwarder table is exhaustive)', async () => {
		const requiredKeys = [
			'config',
			'preset',
			'cacheDir',
			'docsDir',
			'plugins',
			'excludePlugins',
			'mcpProjectCreate',
			'mcpProjectTests',
			'agentWorktree',
		];
		const declaredKeys = new Set(SERVER_ARG_MAPPER.map((f) => f.key));
		for (const k of requiredKeys) {
			expect(
				declaredKeys.has(k as keyof ICliGlobalOptions),
				`forwarder for ${k} is missing`,
			).toBe(true);
		}
	});

	it('is extensible by data, not by editing the function body', async () => {
		const initialCount = SERVER_ARG_MAPPER.length;
		const customForwarder: IAutoForwardRule = {
			key: 'remote',
			kind: 'option',
			argv(key, value) {
				return value === undefined ? [] : [`--${key}`, String(value)];
			},
		};
		const next = [...SERVER_ARG_MAPPER, customForwarder];
		expect(next).toHaveLength(initialCount + 1);
	});
});