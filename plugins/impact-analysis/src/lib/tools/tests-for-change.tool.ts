import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolJson,
	WorkspaceContainmentError,
} from '@mcp-vertex/core/public';

import type {
	IImpactAnalysisToolOptions,
	ITestsForChangeToolArgs,
} from '../contracts/interfaces/impact-analysis.interface';
import { finalizeTestsForChangeOutput } from '../services/impact-analysis-format.service';
import { computeTestsForChange } from '../services/impact-analysis.service';

const InputSchema = z.object({
	files: z.array(z.string()).optional(),
	symbols: z.array(z.string()).optional(),
});

export const TestsForChangeOutputSchema = z.object({
	run: z.array(z.string()),
	skip: z.array(z.string()),
	coverageFocus: z.array(z.string()),
	likelyRelatedFailures: z.array(z.string()),
	bytes: z.number(),
	truncated: z.boolean(),
});

export const runTestsForChange = async (
	args: ITestsForChangeToolArgs,
	options: IImpactAnalysisToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass files or symbols to select relevant tests.',
		);
	}
	if (parsed.data.files === undefined && parsed.data.symbols === undefined) {
		return toolError(
			'tests_for_change requires at least one of files or symbols',
			'Provide changed files or symbols to select tests.',
		);
	}
	try {
		const selection = await computeTestsForChange(parsed.data, options);
		return toolJson(
			finalizeTestsForChangeOutput(
				{
					run: selection.run,
					skip: selection.skip,
					coverageFocus: selection.coverageFocus,
					likelyRelatedFailures: selection.likelyRelatedFailures,
				},
				options.maxBytes,
			),
		);
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

export const buildTestsForChangeToolRegistrations = (
	options: IImpactAnalysisToolOptions,
): IToolRegistration[] => [
	{
		id: 'tests_for_change',
		tags: ['tests', 'selection', 'impact'],
		summary:
			'Select the most relevant tests for a change slice and surface a small sample of explicitly skipped tests.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_tests_for_change`,
				{
					outputSchema: TestsForChangeOutputSchema,
					description:
						'Select focused test files for a change slice from file and symbol anchors, show a bounded sample of skipped tests, and highlight the package scopes that deserve coverage attention.',
					inputSchema: InputSchema,
				},
				async (args) => runTestsForChange(args, options),
			);
		},
	},
];
