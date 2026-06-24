// signal-rules.spec.ts: pin the SOLID signal table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_SIGNAL_RULES,
	matchSignals,
} from '@mcp-vertex/core/lib/bootstrap/signal-rules';
import type { ISignalContext } from '@mcp-vertex/core/lib/bootstrap/signal-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (p) => (p in files ? ['exists'] : []),
});

const makeAnalysis = (
	overrides: Partial<{
		hasPackageJson: boolean;
		framework: string | undefined;
		monorepoTool: string | undefined;
		language:
			| 'typescript'
			| 'javascript'
			| 'python'
			| 'go'
			| 'rust'
			| 'unknown';
		hasMcpProject: boolean;
		agentConfigs: readonly string[];
		ci: readonly string[];
	}>,
) => ({
	hasPackageJson: overrides.hasPackageJson ?? false,
	name: undefined,
	projectType: 'generic' as const,
	language: overrides.language ?? 'unknown',
	packageManager: 'unknown' as const,
	framework: overrides.framework,
	testRunner: 'unknown' as const,
	monorepoTool: overrides.monorepoTool,
	hasMcpProject: overrides.hasMcpProject ?? false,
	mcpEvidence: [],
	ci: overrides.ci ?? [],
	agentConfigs: overrides.agentConfigs ?? [],
	scripts: {},
	signals: [],
});

describe('DEFAULT_SIGNAL_RULES (declarative table)', async () => {
	it('lists the ten built-in signal rules', async () => {
		expect(DEFAULT_SIGNAL_RULES).toHaveLength(10);
	});
	it('every id is unique (the strict contract — no tolerated duplicates)', async () => {
		const ids = DEFAULT_SIGNAL_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('matchSignals', async () => {
	it('emits the no-manifest signal when no package.json + unknown language', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain(
			'no recognised manifest — limited analysis',
		);
	});
	it('emits the mcp-server-missing signal for a fresh project', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({
				hasPackageJson: true,
				language: 'typescript',
			}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain(
			'no MCP server detected; a fresh one can be scaffolded',
		);
		expect(matchSignals(ctx)).not.toContain(
			'an MCP server already exists; recommend augmenting, not replacing',
		);
	});
	it('emits the mcp-server-exists signal when the project already has one', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({
				hasPackageJson: true,
				language: 'typescript',
				hasMcpProject: true,
			}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain(
			'an MCP server already exists; recommend augmenting, not replacing',
		);
		expect(matchSignals(ctx)).not.toContain(
			'no MCP server detected; a fresh one can be scaffolded',
		);
	});
	it('formats the framework signal with the framework name', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({ framework: 'react' }),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain('web framework: react');
	});
	it('formats the monorepo-tool signal with the tool name', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({ monorepoTool: 'nx' }),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain('monorepo tool: nx');
	});
	it('emits the non-js-stack signal for a Python project', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({ language: 'python' }),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain('non-JS stack: python');
	});
	it('does NOT emit the non-js-stack signal for TypeScript', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({ language: 'typescript' }),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).not.toContain('non-JS stack: typescript');
	});
	it('emits the agent-configs signal listing the configs', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({
				agentConfigs: ['CLAUDE.md', 'AGENTS.md'],
			}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain(
			'existing agent config (CLAUDE.md, AGENTS.md); align with it',
		);
	});
	it('emits the custom-extra-tools signal when the host-config has custom bits', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({}),
			hasCustomExtraTools: true,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain(
			'host-config has custom extraTools',
		);
	});
	it('emits the custom-vertex-config signal when mcp-vertex.config.json has config', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: true,
		};
		expect(matchSignals(ctx)).toContain(
			'mcp-vertex.config.json has plugin or validation config',
		);
	});
	it('emits the ci signal listing the CI systems', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({ ci: ['github-actions', 'jenkins'] }),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		expect(matchSignals(ctx)).toContain('CI: github-actions, jenkins');
	});
	it('emits signals in priority order (manifest → mcp → framework → …)', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({
				hasPackageJson: true,
				framework: 'react',
				ci: ['github-actions'],
			}),
			hasCustomExtraTools: true,
			hasCustomVertexConfig: true,
		};
		const out = matchSignals(ctx);
		// mcp-server-missing (195) → web-framework (100) →
		// agent-configs (70) → custom-extra-tools (60) →
		// custom-vertex-config (50) → ci (40).
		expect(
			out.indexOf(
				'no MCP server detected; a fresh one can be scaffolded',
			),
		).toBeLessThan(out.indexOf('web framework: react'));
		expect(out.indexOf('web framework: react')).toBeLessThan(
			out.indexOf('host-config has custom extraTools'),
		);
	});
	it('a custom rule table adds signals without forking the matcher', async () => {
		const ctx: ISignalContext = {
			analysis: makeAnalysis({}),
			hasCustomExtraTools: false,
			hasCustomVertexConfig: false,
		};
		const out = matchSignals(ctx, [
			...DEFAULT_SIGNAL_RULES,
			{
				id: 'corporate-compliance',
				priority: 1000,
				condition: () => true,
				summary: () => 'runs through internal compliance review',
			},
		]);
		expect(out[0]).toBe('runs through internal compliance review');
	});
});

describe('integration: analyzeProject uses the rule table', async () => {
	it('emits the same signals as the pre-refactor chain (regression guard)', async () => {
		// A TypeScript + React project with a tsconfig + AGENTS.md
		// + a CI workflow directory + an mcp-vertex.config.json
		// with a plugin.
		const analysis = await analyzeProject(
			reader({
				'tsconfig.json': '{}',
				'package.json': JSON.stringify({
					name: 'app',
					dependencies: { react: '^18' },
				}),
				'AGENTS.md': '# guide',
				'.github/workflows': 'ci.yml',
				'mcp-vertex.config.json': JSON.stringify({
					plugins: { quality: {} },
				}),
			}),
		);
		// No manifest signal (has package.json).
		expect(analysis.signals).not.toContain(
			'no recognised manifest — limited analysis',
		);
		// mcp-server-missing.
		expect(analysis.signals).toContain(
			'no MCP server detected; a fresh one can be scaffolded',
		);
		// web framework.
		expect(analysis.signals).toContain('web framework: react');
		// agent-configs.
		expect(analysis.signals).toContain(
			'existing agent config (AGENTS.md); align with it',
		);
		// custom-vertex-config.
		expect(analysis.signals).toContain(
			'mcp-vertex.config.json has plugin or validation config',
		);
		// ci.
		expect(analysis.signals).toContain('CI: github-actions');
		// does NOT emit custom-extra-tools (no host-config.ts).
		expect(analysis.signals).not.toContain(
			'host-config has custom extraTools',
		);
	});
});
