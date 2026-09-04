import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@delendai/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import { recommendServerPlan } from '@delendai/core/lib/bootstrap/recommend-plan';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (p) => {
		const prefix = p === '' ? '' : `${p}/`;
		const entries = new Set<string>();
		for (const key of Object.keys(files)) {
			if (!key.startsWith(prefix)) continue;
			const remainder = key.slice(prefix.length);
			if (remainder.length === 0) continue;
			const head = remainder.split('/')[0];
			if (head !== undefined && head.length > 0) entries.add(head);
		}
		return [...entries];
	},
});

describe('analyzeProject', async () => {
	it('detects a TypeScript library with vitest', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/widgets',
					main: './src/index.ts',
					devDependencies: { vitest: '^4' },
					scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
				}),
				'tsconfig.json': '{}',
			}),
		);
		expect(analysis.projectType).toBe('library');
		expect(analysis.language).toBe('typescript');
		expect(analysis.testRunner).toBe('vitest');
		expect(analysis.hasMcpProject).toBe(false);
		expect(analysis.ciProvider).toBe('unknown');
	});

	it('detects a web app and an existing MCP server', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'site',
					dependencies: {
						'@angular/core': '^22',
						'@modelcontextprotocol/sdk': '^1',
					},
				}),
				'.vscode/mcp.json': '{}',
			}),
		);
		expect(analysis.projectType).toBe('webapp');
		expect(analysis.framework).toBe('angular');
		expect(analysis.hasMcpProject).toBe(true);
	});

	it('degrades gracefully without a package.json', async () => {
		const analysis = await analyzeProject(reader({}));
		expect(analysis.hasPackageJson).toBe(false);
		expect(analysis.projectType).toBe('generic');
	});

	it('detects non-JS stacks (rust cli) and CI + agent configs', async () => {
		const analysis = await analyzeProject(
			reader({
				'Cargo.toml': '[package]\nname="x"',
				'src/main.rs': 'fn main() {}',
				'.gitlab-ci.yml': 'stages: [test]',
				'CLAUDE.md': '# guide',
			}),
		);
		expect(analysis.language).toBe('rust');
		expect(analysis.projectType).toBe('cli');
		expect(analysis.ci).toContain('gitlab-ci');
		expect(analysis.ciProvider).toBe('gitlab-ci');
		expect(analysis.agentConfigs).toContain('CLAUDE.md');
		expect(analysis.docsConventions).toEqual([]);
		expect(analysis.conflicts).toEqual([]);
	});

	it('detects monorepo tooling (nx/turbo)', async () => {
		const analysis = await analyzeProject(
			reader({ 'package.json': '{"name":"r"}', 'turbo.json': '{}' }),
		);
		expect(analysis.monorepoTool).toBe('turbo');
		expect(analysis.projectType).toBe('monorepo');
	});

	it('derives the self-host prefix and target from the real workspace identity', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@delendai/core-monorepo',
					workspaces: ['packages/*'],
				}),
			}),
		);
		const plan = await recommendServerPlan(analysis);
		expect(plan.namespacePrefix).toBe('mcp-vertex');
		expect(plan.targetDir).toBe('packages/core');
	});

	it('detects mature monorepo adoption signals: ci, docs and scaffold conflicts', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/platform',
					workspaces: ['packages/*'],
					dependencies: { astro: '^5' },
					scripts: {
						validate: 'bun run validate',
						lint: 'biome check .',
						test: 'vitest run',
					},
				}),
				'README.md': '# Platform',
				'CONTRIBUTING.md': '# Contributing',
				'astro.config.mjs': 'export default {}',
				'.github/workflows/ci.yml': 'name: ci',
				'.vscode/mcp.json': '{}',
				'mcp-vertex.config.json': '{}',
			}),
		);
		expect(analysis.projectType).toBe('monorepo');
		expect(analysis.ciProvider).toBe('github-actions');
		expect(analysis.docsConventions).toEqual([
			'README.md',
			'root-markdown',
			'docs-site:astro',
		]);
		expect(analysis.conflicts).toEqual([
			'script:validate',
			'script:lint',
			'script:test',
			'config:mcp-vertex.config.json',
			'config:.vscode/mcp.json',
		]);
	});

	it('degrades cleanly for non-TS repos without docs or scaffold conflicts', async () => {
		const analysis = await analyzeProject(
			reader({
				'go.mod': 'module example.com/service',
				'cmd/main.go': 'package main',
			}),
		);
		expect(analysis.language).toBe('go');
		expect(analysis.ciProvider).toBe('unknown');
		expect(analysis.docsConventions).toEqual([]);
		expect(analysis.conflicts).toEqual([]);
	});
});

describe('recommendServerPlan', async () => {
	it('recommends the proposals plugin for a monorepo and a mcp.json snippet', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'big',
					workspaces: ['packages/*'],
				}),
			}),
		);
		const plan = await recommendServerPlan(analysis);
		expect(plan.projectType).toBe('monorepo');
		expect(plan.plugins).toContain('proposals');
		expect(plan.namespacePrefix).toBe('big');
		expect(JSON.stringify(plan.mcpJson)).toContain('@delendai/core');
	});
});
