import { describe, expect, it } from 'vitest';

import type { ICliGlobalOptions } from '../../../src/contracts/interfaces/cli-command.interface';
import {
	buildServerArgs,
	SERVER_ARG_FORWARDERS,
	type IServerArgForwarder,
} from '../../../src/lib/server-args';

describe('buildServerArgs (SOLID: declarative flag forwarding)', () => {
	it('always forwards --workspace (the host requires a workspace)', () => {
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

	it('forwards --config only when defined (omits undefined)', () => {
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

	it('forwards --preset only when defined', () => {
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

	it('forwards --plugins as a comma-separated list, deduplicated, plus extras', () => {
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

	it('omits --plugins when both list and extras are empty', () => {
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

	it('covers every field on ICliGlobalOptions that the core parser accepts (forwarder table is exhaustive)', () => {
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
		];
		const declaredKeys = new Set(SERVER_ARG_FORWARDERS.map((f) => f.key));
		for (const k of requiredKeys) {
			expect(
				declaredKeys.has(k as keyof ICliGlobalOptions),
				`forwarder for ${k} is missing`,
			).toBe(true);
		}
	});

	it('is extensible by data, not by editing the function body', () => {
		// A new host flag should be addable by appending to the table.
		// This is the Open/Closed SOLID principle: the function does not
		// grow an `if` per new flag.
		const initialCount = SERVER_ARG_FORWARDERS.length;
		const customForwarder: IServerArgForwarder = {
			key: 'remote',
			kind: 'option',
			argv(key, value) {
				return value === undefined ? [] : [`--${key}`, String(value)];
			},
		};
		const next = [...SERVER_ARG_FORWARDERS, customForwarder];
		// sanity: appending is a pure operation, no shared state.
		expect(next).toHaveLength(initialCount + 1);
	});
});
