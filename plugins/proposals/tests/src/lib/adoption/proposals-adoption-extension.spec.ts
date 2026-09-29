import { afterEach, describe, expect, it } from 'vitest';

import {
	buildAdoptionAssessment,
	buildAdoptProjectPlan,
	registerAdoptionExtensions,
} from '@delendai/core/public';
import { resetAdoptionExtensionsForTests } from '@delendai/core/lib/adopt/adoption-extension-registry';

import { buildProposalsAdoptionExtension } from '@delendai/proposals/lib/adoption/proposals-adoption-extension';

const derivedConfig = {
	$schema: 'https://example.test/schema.json',
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
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
				namespacePrefix: 'delendai',
				mcpServerName: 'delendai',
				docsDir: 'docs/delendai',
			},
			plan: {
				config: { plugins: {} },
				rationale: ['derived rationale'],
				files: [],
				residual: [
					'Launch the host: bunx --package @delendai/cli delendai __serve --workspace . --preset standard',
					'(Optional) Wire GitHub issues later: run `delendai_setup_github`, then set `plugins.issues.options.repo` to your `owner/name` slug.',
				],
			},
		});

		const plugins = result?.config as {
			plugins: Record<string, unknown>;
		};
		expect(result).toBeDefined();
		expect(plugins.plugins.proposals).toBeDefined();
		expect(result?.files).toContainEqual({
			path: 'docs/delendai/proposals/README.md',
			content: expect.stringContaining('# Proposals'),
		});
		expect(result?.files).toContainEqual({
			path: 'docs/delendai/proposals/ready/.gitkeep',
			content: '',
		});
		expect(
			result?.residual.some((line) => line.includes('sync_proposals')),
		).toBe(true);
		expect(
			result?.residual.some((line) => line.includes('create_proposal')),
		).toBe(true);
	});

	it('adds proposals and leaves the issues wiring the core applied from its manifest as it found it', () => {
		const extension = buildProposalsAdoptionExtension();
		const issuesWiring = { options: { repo: 'acme/widgets' } };
		const residual = [
			'Launch the host: bunx --package @delendai/cli delendai __serve --workspace . --preset full',
			'Verify GitHub issues: run `delendai_setup_github` and confirm the acme/widgets tier resolves.',
		];
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
				namespacePrefix: 'delendai',
				mcpServerName: 'delendai',
				docsDir: 'docs/delendai',
				repo: 'acme/widgets',
			},
			plan: {
				config: { plugins: { issues: issuesWiring } },
				rationale: ['derived rationale'],
				files: [],
				residual,
			},
		});

		const plugins = result?.config as {
			plugins: Record<string, unknown>;
		};
		expect(plugins.plugins.proposals).toBeDefined();
		expect(plugins.plugins.issues).toEqual(issuesWiring);
		expect(result?.rationale).toEqual(['derived rationale']);
		expect(result?.residual.slice(0, residual.length)).toEqual(residual);
	});
});

describe('the adoption write estimate with the proposals extension loaded', () => {
	afterEach(() => {
		resetAdoptionExtensionsForTests();
	});

	it('counts exactly the store files the adoption plan writes', () => {
		registerAdoptionExtensions('proposals', [
			buildProposalsAdoptionExtension(),
		]);
		const request = {
			analysis,
			topLevelDirs: [],
			projectName: 'Workspace',
			namespacePrefix: 'delendai',
			mcpServerName: 'delendai',
			docsDir: 'docs/delendai',
		};

		const plan = buildAdoptProjectPlan(request);
		const estimate = buildAdoptionAssessment(analysis, [], {
			projectName: 'Workspace',
			namespacePrefix: 'delendai',
			mcpServerName: 'delendai',
			docsDir: 'docs/delendai',
		}).conflicts.find((conflict) => conflict.kind === 'write-estimate');
		const storeFiles = plan.files.filter((file) =>
			file.path.startsWith('docs/delendai/proposals/'),
		);

		expect(storeFiles.length).toBeGreaterThan(0);
		expect(
			estimate?.breakdown?.find((entry) => entry.kind === 'plugin'),
		).toMatchObject({ count: storeFiles.length, exact: true });
		expect(estimate?.count).toBe(plan.files.length + 1);
	});
});
