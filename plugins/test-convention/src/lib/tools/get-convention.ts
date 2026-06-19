import { z } from 'zod';

import {
	toolJson,
	type IToolRegistration,
	type IToolTextResult,
} from '@mcp-vertex/core/public';

import type { ITestConvention } from '../../convention';
import { renderOverviewMarkdown } from '../knowledge';

export interface IGetConventionOptions {
	readonly namespacePrefix: string;
	readonly convention: ITestConvention;
}

const OutputSchema = z.object({
	convention: z.object({
		specExtension: z.string(),
		specLayout: z.enum(['colocate', 'tests-mirror', 'tests-flat']),
		runners: z.array(z.string()),
		mockStyle: z.enum(['vi', 'jest', 'auto']),
		requireDescribe: z.boolean(),
		coverageThreshold: z.object({
			lines: z.number(),
			functions: z.number(),
			branches: z.number(),
			statements: z.number(),
		}),
		forbiddenPatterns: z.array(z.string()),
		languages: z.array(z.string()),
	}),
	markdown: z.string(),
});

/**
 * `<prefix>_get_convention` — return the canonical convention for the
 * workspace as both structured data and a markdown block the agent
 * can drop into its context.
 */
export const buildGetConvention = (
	options: IGetConventionOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'get_convention',
		summary:
			'Return the canonical test convention for the workspace (structured + markdown).',
		tags: ['testing', 'convention'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_get_convention`,
				{
					description:
						'Returns the canonical test convention the workspace expects: spec extension, layout, mock API, coverage thresholds, forbidden patterns and language list. Output is both a structured object (machine-readable) and a markdown block (paste-ready).',
					inputSchema: z.object({}).strict(),
					outputSchema: OutputSchema,
				},
				async (): Promise<IToolTextResult> =>
					toolJson({
						convention: {
							specExtension: options.convention.specExtension,
							specLayout: options.convention.specLayout,
							runners: [...options.convention.runners],
							mockStyle: options.convention.mockStyle,
							requireDescribe: options.convention.requireDescribe,
							coverageThreshold: {
								lines: options.convention.coverageThreshold
									.lines,
								functions:
									options.convention.coverageThreshold
										.functions,
								branches:
									options.convention.coverageThreshold
										.branches,
								statements:
									options.convention.coverageThreshold
										.statements,
							},
							forbiddenPatterns:
								options.convention.forbiddenPatterns.map(
									(r) => r.source,
								),
							languages: [...options.convention.languages],
						},
						markdown: renderOverviewMarkdown(options.convention),
					}),
			);
		},
	};
};
