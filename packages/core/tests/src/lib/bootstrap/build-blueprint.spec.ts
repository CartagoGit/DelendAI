import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	buildBlueprintFiles,
	buildServerBlueprint,
} from '@mcp-vertex/core/lib/bootstrap/build-blueprint';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('buildServerBlueprint', async () => {
	it('produces an exhaustive blueprint with script-derived tools + tests by default', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/site',
					dependencies: { '@angular/core': '^21' },
					scripts: {
						lint: 'eslint .',
						test: 'vitest',
						build: 'ng build',
					},
				}),
				'tsconfig.json': '{}',
			}),
		);
		const bp = buildServerBlueprint(analysis);
		expect(bp.namespacePrefix).toBe('site');
		expect(bp.projectType).toBe('webapp');
		expect(bp.plugins).toContain('rules');
		const toolNames = bp.tools.map((t) => t.name);
		expect(toolNames).toContain('check_project_state');
		expect(toolNames).toContain('run_lint');
		expect(toolNames).toContain('run_test');
		expect(bp.skills.some((s) => s.name.includes('angular'))).toBe(true);
		expect(bp.agents[0]?.slot).toBe('orchestrator');
		expect(bp.tests).toBe(true);
		expect(bp.defaults).toEqual({
			keepLegacy: false,
			reasons: ['greenfield-safe default'],
			warnings: [],
		});
	});

	it('omits tests when requested and notes an existing server', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({ name: 'svc' }),
				'.vscode/mcp.json': '{}',
			}),
		);
		const bp = buildServerBlueprint(analysis, { tests: false });
		expect(bp.tests).toBe(false);
		expect(bp.hasExistingServer).toBe(true);
		expect(bp.notes.join(' ')).toMatch(/already exists/);
	});

	it('materialises files: host project + a file (and test) per tool', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'lib',
					main: './x.ts',
					scripts: { test: 'vitest' },
				}),
				'tsconfig.json': '{}',
			}),
		);
		const bp = buildServerBlueprint(analysis);
		const files = buildBlueprintFiles(bp);
		const paths = files.map((f) => f.path);
		expect(paths).toContain('libs/mcp-project/src/server.ts');
		expect(
			paths.some((p) => p.includes('-check-project-state.tool.ts')),
		).toBe(true);
		expect(paths.some((p) => p.includes('.tool.spec.ts'))).toBe(true);
	});

	it('recommends keepLegacy when host-config has custom extraTools', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({ name: 'svc' }),
				'libs/mcp-project/src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [registerCustomTool()],
});
`,
			}),
		);
		const bp = buildServerBlueprint(analysis);
		expect(bp.defaults.keepLegacy).toBe(true);
		expect(bp.defaults.reasons).toContain(
			'host-config has custom extraTools',
		);
		expect(bp.defaults.warnings[0]).toMatch(/legacy/);
	});

	it('recommends keepLegacy when the user intent is migration work', async () => {
		const analysis = await analyzeProject(
			reader({ 'package.json': JSON.stringify({ name: 'svc' }) }),
		);
		const bp = buildServerBlueprint(analysis, {
			intent: 'refactor the MCP host and replace the old scaffold',
		});
		expect(bp.defaults.keepLegacy).toBe(true);
		expect(bp.defaults.reasons).toContain(
			'user request mentions migration/refactor work',
		);
	});
});
