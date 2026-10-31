/**
 * init-plugins-are-installed.spec.ts — a project that runs the published
 * CLI gets the plugins `init` configures: the default preset's plugins are
 * the CLI's own dependencies. `init` writes no dependency, and a project
 * with no package manifest has only what the CLI brought.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolvePluginSet } from './init-render.service';

describe('the default preset reaches an installed CLI', () => {
	it('lists every plugin of the swarm preset among the CLI dependencies', () => {
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, '../../../package.json'),
				'utf8',
			),
		) as { dependencies: Record<string, string> };
		const plugins = resolvePluginSet({
			preset: 'swarm',
			extraPlugins: [],
			excludedPlugins: [],
		} as unknown as Parameters<typeof resolvePluginSet>[0]);
		expect(plugins.length).toBeGreaterThan(0);
		expect(
			plugins.filter(
				(plugin) =>
					manifest.dependencies[`@delendai/${plugin}`] === undefined,
			),
		).toEqual([]);
	});
});
