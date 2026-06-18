import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { recommendServerPlan } from '@mcp-vertex/core/lib/bootstrap/recommend-plan';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('analyzeProject', () => {
	it('detects a TypeScript library with vitest', () => {
		const analysis = analyzeProject(
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
	});

	it('detects a web app and an existing MCP server', () => {
		const analysis = analyzeProject(
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

	it('degrades gracefully without a package.json', () => {
		const analysis = analyzeProject(reader({}));
		expect(analysis.hasPackageJson).toBe(false);
		expect(analysis.projectType).toBe('generic');
	});

	it('detects non-JS stacks (rust cli) and CI + agent configs', () => {
		const analysis = analyzeProject(
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
		expect(analysis.agentConfigs).toContain('CLAUDE.md');
	});

	it('detects monorepo tooling (nx/turbo)', () => {
		const analysis = analyzeProject(
			reader({ 'package.json': '{"name":"r"}', 'turbo.json': '{}' }),
		);
		expect(analysis.monorepoTool).toBe('turbo');
		expect(analysis.projectType).toBe('monorepo');
	});
});

describe('recommendServerPlan', () => {
	it('recommends the proposals plugin for a monorepo and a mcp.json snippet', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'big',
					workspaces: ['packages/*'],
				}),
			}),
		);
		const plan = recommendServerPlan(analysis);
		expect(plan.projectType).toBe('monorepo');
		expect(plan.plugins).toContain('proposals');
		expect(plan.namespacePrefix).toBe('big');
		expect(JSON.stringify(plan.mcpJson)).toContain('@mcp-vertex/core');
	});
});
