import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolJson,
	WorkspaceContainmentError,
} from '@mcp-vertex/core/public';

import {
	IMPACT_ANALYSIS_DEPENDS_ON,
	HIGH_RISK_AFFECTED_PACKAGES_THRESHOLD,
	HIGH_RISK_DEPENDENTS_THRESHOLD,
} from '../contracts/constants/impact-analysis.constant';
import type {
	IImpactAnalyzeToolArgs,
	IImpactAnalysisToolOptions,
} from '../contracts/interfaces/impact-analysis.interface';
import { finalizeImpactAnalyzeOutput } from '../services/impact-analysis-format.service';
import { buildImpactAnalyzePayload } from '../services/impact-analysis.service';
import { buildTestsForChangeToolRegistrations } from './tests-for-change.tool';

const InputSchema = z.object({
	files: z.array(z.string()).optional(),
	gitDiff: z.string().optional(),
	symbols: z.array(z.string()).optional(),
});

export const ImpactAnalyzeOutputSchema = z.object({
	changedSymbols: z.array(z.string()),
	dependents: z.array(z.string()),
	affectedPackages: z.array(z.string()),
	recommendedTests: z.array(z.string()),
	risk: z.enum(['low', 'medium', 'high']),
	dependsOn: z.array(z.string()),
	bytes: z.number(),
	truncated: z.boolean(),
});

export const runImpactAnalyze = async (
	args: IImpactAnalyzeToolArgs,
	options: IImpactAnalysisToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass files, gitDiff or symbols to analyze impact.',
		);
	}
	if (
		parsed.data.files === undefined &&
		parsed.data.gitDiff === undefined &&
		parsed.data.symbols === undefined
	) {
		return toolError(
			'impact_analyze requires at least one of files, gitDiff or symbols',
			'Provide the changed files, a git diff, or explicit symbols.',
		);
	}
	try {
		const payload = await buildImpactAnalyzePayload(parsed.data, options);
		return toolJson(finalizeImpactAnalyzeOutput(payload, options.maxBytes));
	} catch (error) {
		if (error instanceof WorkspaceContainmentError) {
			return toolError(
				`workspace-containment: ${error.message}`,
				'Pass only workspace-contained source paths; absolute paths outside the workspace and reserved paths like .git, .env and node_modules are rejected.',
			);
		}
		throw error;
	}
};

export const buildImpactAnalyzeToolRegistrations = (
	options: IImpactAnalysisToolOptions,
): IToolRegistration[] => [
	{
		id: 'impact_analyze',
		tags: ['impact', 'analysis', 'tests'],
		summary:
			'Estimate the impact of a change by deriving changed symbols, lexical dependents, affected packages, related tests and a bounded risk level.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_impact_analyze`,
				{
					outputSchema: ImpactAnalyzeOutputSchema,
					description: `Analyze the likely impact of a change slice from files, diff or explicit symbols. The risk heuristic is high when packages/core is touched, when dependents reach ${HIGH_RISK_DEPENDENTS_THRESHOLD}+ files, or when ${HIGH_RISK_AFFECTED_PACKAGES_THRESHOLD}+ package scopes are affected; medium when there is at least one dependent; low otherwise. Reuses git/search/refactor/test-policy public surfaces and returns dependsOn=${IMPACT_ANALYSIS_DEPENDS_ON.join(', ')}.`,
					inputSchema: InputSchema,
				},
				async (args) => runImpactAnalyze(args, options),
			);
		},
	},
];

export const buildImpactAnalysisToolRegistrations = (
	options: IImpactAnalysisToolOptions,
): IToolRegistration[] => [
	...buildImpactAnalyzeToolRegistrations(options),
	...buildTestsForChangeToolRegistrations(options),
];
