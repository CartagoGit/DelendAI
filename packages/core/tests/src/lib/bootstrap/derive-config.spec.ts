import { describe, expect, it } from 'vitest';

import type { IProjectAnalysis } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { deriveConfig } from '@mcp-vertex/core/lib/bootstrap/derive-config';

const analysis = (overrides: Partial<IProjectAnalysis>): IProjectAnalysis => ({
	hasPackageJson: true,
	name: 'fixture',
	projectType: 'library',
	language: 'typescript',
	packageManager: 'bun',
	framework: undefined,
	testRunner: 'vitest',
	monorepoTool: undefined,
	hasMcpProject: false,
	mcpEvidence: [],
	ci: [],
	agentConfigs: [],
	scripts: {},
	signals: [],
	...overrides,
});

describe('deriveConfig (f00117 S1)', () => {
	it('TS monorepo → standard preset expanded into the plugins map, with real roots', () => {
		const derived = deriveConfig(
			analysis({ monorepoTool: 'bun-workspaces' }),
			{
				topLevelDirs: [
					'packages',
					'apps',
					'node_modules',
					'.git',
					'docs',
				],
			},
		);
		expect(derived.preset).toBe('standard');
		const plugins = Object.keys(derived.config.plugins);
		expect(plugins).toContain('git');
		expect(plugins).toContain('memory');
		expect(plugins).toContain('test-policy');
		// Roots derive from the REAL top-level dirs, never node_modules.
		const searchRoots = (
			derived.config.plugins.search as { options: { roots: string[] } }
		).options.roots;
		expect(searchRoots).toEqual(['packages', 'apps', 'docs']);
		expect(derived.rationale.length).toBeGreaterThan(0);
	});

	it('TS single package → lean essentials', () => {
		const derived = deriveConfig(analysis({}), { topLevelDirs: ['src'] });
		expect(derived.preset).toBe('lean');
		expect(Object.keys(derived.config.plugins)).toEqual([
			'git',
			'search',
			'memory',
			'docs',
		]);
	});

	it('non-TS repo → minimal + conventions with the language profile named in the rationale', () => {
		const derived = deriveConfig(
			analysis({ language: 'python', hasPackageJson: false }),
			{ topLevelDirs: ['src', 'tests'] },
		);
		expect(derived.preset).toBe('minimal');
		expect(Object.keys(derived.config.plugins)).toContain('conventions');
		expect(derived.rationale.join(' ')).toContain('python');
	});

	it('every recommendation carries a one-line rationale and canonical paths', () => {
		const derived = deriveConfig(analysis({}), { topLevelDirs: [] });
		expect(derived.config.cacheDir).toBe('.cache/mcp-vertex');
		expect(derived.config.docsDir).toBe('docs/mcp-vertex');
		expect(derived.rationale.every((line) => line.length > 10)).toBe(true);
	});
});
