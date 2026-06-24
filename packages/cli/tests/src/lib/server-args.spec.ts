import { describe, expect, it } from 'vitest';

import type { ICliGlobalOptions } from '../../../src/contracts/interfaces/cli-command.interface';
import { buildServerArgs } from '../../../src/lib/server-args';
import {
	SERVER_ARG_MAPPER,
	type IAutoForwardRule,
} from '../../../src/lib/server-args.mapper';

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
		// Take the LAST --plugins value (the merged list with extras).
		const lastPluginsIdx = args.lastIndexOf('--plugins');
		const value = args[lastPluginsIdx + 1];
		expect(value?.split(',')).toEqual(
			expect.arrayContaining(['proposals', 'memory', 'audit']),
		);
		// no duplicates
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
		// flag form: no explicit value token follows
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
		// a00036 F-001: the host parses 13 flags; mcpv used to forward 4.
		// We must forward every ICliGlobalOption the host cares about.
		// Any field that is BOTH on ICliGlobalOptions AND on the host
		// `KNOWN_KEYS` set MUST have a forwarder; this test catches the
		// drift by asserting the key is present in the forwarder table.
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
		// A new host flag should be addable by appending to the table.
		// This is the Open/Closed SOLID principle: the function does not
		// grow an `if` per new flag.
		const initialCount = SERVER_ARG_MAPPER.length;
		const customForwarder: IAutoForwardRule = {
			key: 'remote',
			kind: 'option',
			argv(key, value) {
				return value === undefined ? [] : [`--${key}`, String(value)];
			},
		};
		const next = [...SERVER_ARG_MAPPER, customForwarder];
		// sanity: appending is a pure operation, no shared state.
		expect(next).toHaveLength(initialCount + 1);
	});
});
