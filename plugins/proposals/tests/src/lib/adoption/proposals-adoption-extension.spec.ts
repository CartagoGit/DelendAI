import { describe, expect, it } from 'vitest';

import { buildProposalsAdoptionExtension } from '@mcp-vertex/proposals/lib/adoption/proposals-adoption-extension';

const derivedConfig = {
	$schema: 'https://example.test/schema.json',
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	plugins: {},
} as const;

const analysis = {
	hasPackageJson: true,
	name: 'Workspace',
	projectType: 'generic',
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
} as const;

describe('buildProposalsAdoptionExtension', () => {
	it('bootstraps the proposals store and proposal-specific residual steps', () => {
		const extension = buildProposalsAdoptionExtension();
		const result = extension.applyAdoptionPlan?.({
			derived: {
				preset: 'standard',
				config: derivedConfig,
				rationale: ['derived rationale'],
			},
			request: {
				analysis,
				topLevelDirs: ['docs'],
				projectName: 'Workspace',
				namespacePrefix: 'mcp-vertex',
				mcpServerName: 'mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			plan: {
				config: { plugins: {} },
				rationale: ['derived rationale'],
				files: [],
				residual: [
					'Launch the host: bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset standard',
					'(Optional) Wire GitHub issues later: run `mcp-vertex_setup_github`, then set `plugins.issues.options.repo` to your `owner/name` slug.',
				],
			},
		});

		const plugins = result?.config as {
			plugins: Record<string, unknown>;
		};
		expect(result).toBeDefined();
		expect(plugins.plugins.proposals).toBeDefined();
		expect(result?.files).toContainEqual({
			path: 'docs/mcp-vertex/proposals/README.md',
			content: expect.stringContaining('# Proposals'),
		});
		expect(result?.files).toContainEqual({
			path: 'docs/mcp-vertex/proposals/ready/.gitkeep',
			content: '',
		});
		expect(
			result?.residual.some((line) => line.includes('sync_proposals')),
		).toBe(true);
		expect(
			result?.residual.some((line) => line.includes('create_proposal')),
		).toBe(true);
	});

	it('wires proposals + issues and upgrades the launch step when repo is provided', () => {
		const extension = buildProposalsAdoptionExtension();
		const result = extension.applyAdoptionPlan?.({
			derived: {
				preset: 'standard',
				config: derivedConfig,
				rationale: ['derived rationale'],
			},
			request: {
				analysis,
				topLevelDirs: ['docs'],
				projectName: 'Workspace',
				namespacePrefix: 'mcp-vertex',
				mcpServerName: 'mcp-vertex',
				docsDir: 'docs/mcp-vertex',
				repo: 'acme/widgets',
			},
			plan: {
				config: { plugins: {} },
				rationale: ['derived rationale'],
				files: [],
				residual: [
					'Launch the host: bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset standard',
					'GitHub repo provided (acme/widgets). Wire plugin-specific adoption explicitly if you want issue ingestion during adoption.',
				],
			},
		});

		const plugins = result?.config as {
			plugins: Record<string, unknown>;
		};
		expect(plugins.plugins.proposals).toBeDefined();
		expect(plugins.plugins.issues).toEqual({
			options: { repo: 'acme/widgets' },
		});
		expect(result?.rationale).toContain(
			'GitHub issues wired for acme/widgets — the config loads the proposals + issues plugins; launch with --preset full (or --plugins proposals,issues).',
		);
		expect(result?.residual[0]).toContain('--preset full');
		expect(
			result?.residual.some((line) =>
				line.includes(
					'Verify GitHub issues: run `mcp-vertex_setup_github`',
				),
			),
		).toBe(true);
	});
});
