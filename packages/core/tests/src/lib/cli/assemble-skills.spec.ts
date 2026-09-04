import { mkdirSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IProposalSummary } from '../../../../src/lib/catalog/agent-discovery-types';
import {
	assembleSkills,
	type IAssembleSkillsInput,
} from '../../../../src/lib/cli/assemble-skills';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';
import {
	registerWorkflowContribution,
	resetWorkflowContributionRegistryForTests,
	type IAssembleWorkflowContributionsInput,
} from '../../../../src/lib/cli/workflow-contribution-assembly';

const createInput = (workspace: string): IAssembleSkillsInput => ({
	args: {
		plugins: [],
		presetPlugins: [],
		flagPlugins: [],
		excludePlugins: [],
		cacheDir: '.cache',
		docsDir: 'docs',
		workspace,
		surfaceMode: 'managed',
		serverName: 'delendai',
		serverVersion: '0.1.0',
		mcpProjectCreate: true,
		mcpProjectTests: true,
		extra: {},
		tokens: {},
	},
	fileConfig: {
		$schema:
			'https://unpkg.com/@delendai/core/schema/delendai.config.schema.json',
		coreVersion: 'latest-published',
		cacheDir: '.cache',
		docsDir: 'docs',
	},
	docsDir: 'docs',
	cacheDir: '.cache',
	corePrefix: 'delendai',
	docsDirMissing: false,
	configPresent: true,
	readFile: async () => undefined,
	loadResult: {
		loaded: [],
		errors: [],
		registerErrors: [],
	},
	portablePluginPackages: [],
	configurationArtifacts: [],
});

describe('assembleSkills workflow contributions', () => {
	let workspace = '';

	beforeEach(() => {
		workspace = createTestWorkspace('assemble-skills-');
		mkdirSync(`${workspace}/docs`, { recursive: true });
		resetWorkflowContributionRegistryForTests();
	});

	afterEach(() => {
		resetWorkflowContributionRegistryForTests();
		removeTestWorkspace(workspace);
	});

	it('uses registered workflow contributions for proposal summaries and recommended action', async () => {
		const proposalSummaries: readonly IProposalSummary[] = [
			{
				id: 'r00043',
				title: 'Make workflow assembly agnostic',
				track: 'core',
				status: 'in-progress',
				kind: 'refactor',
				date: '2026-08-30',
			},
		];
		registerWorkflowContribution(
			'proposals',
			async (input: IAssembleWorkflowContributionsInput) => ({
				summary: {
					title: 'Workflow snapshot',
					detail: '1 proposal is currently actionable.',
				},
				stableTools: [],
				recommendedNextAction: {
					title: 'Start work',
					detail: `Call ${input.corePrefix}_overview, then ${input.corePrefix}_proposals_auto_work to start working.`,
				},
				proposalSummaries,
			}),
		);

		const result = await assembleSkills({
			...createInput(workspace),
			loadResult: {
				loaded: [
					{
						specifier: 'rules',
						resolved: '/rules',
						plugin: { name: 'rules', register: async () => ({}) },
						registrations: {},
						runtime: { registrations: {} },
					},
				],
				errors: [],
				registerErrors: [],
			},
		});

		expect(result.proposalSummaries).toEqual(proposalSummaries);
		expect(result.recommendedNextAction).toBe(
			'Call delendai_overview, then delendai_proposals_auto_work to start working. ALWAYS write new or modified code already compliant with the active rules (rules_get_rules) — it is the default, no need to be told.',
		);
	});

	it('falls back to a generic valid action when no provider contributes workflow data', async () => {
		const result = await assembleSkills(createInput(workspace));

		expect(result.proposalSummaries).toEqual([]);
		expect(result.recommendedNextAction).toBe(
			'Call delendai_analyze_project to see what this project needs.',
		);
	});

	it('keeps config mismatch precedence over workflow provider actions', async () => {
		registerWorkflowContribution('proposals', async () => ({
			summary: {
				title: 'Workflow snapshot',
				detail: 'Should not win over config mismatch.',
			},
			stableTools: [],
			recommendedNextAction: {
				title: 'Start work',
				detail: 'provider action',
			},
		}));

		const result = await assembleSkills({
			...createInput(workspace),
			docsDirMissing: true,
			docsDir: 'missing-docs',
		});

		expect(result.recommendedNextAction).toBe(
			'Config mismatch: docsDir "missing-docs" does not exist in this workspace (see configIssues). Fix delendai.config.json or scaffold the layout (delendai init) BEFORE starting work; do not hand-create proposals or docs outside the server workflow.',
		);
	});
});
