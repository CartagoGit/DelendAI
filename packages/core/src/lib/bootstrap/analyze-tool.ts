// analyze-tool: the `<prefix>_analyze_project` MCP tool.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// tool that returns `{ analysis, plan }` for the current workspace.
// It does not know about drift, scaffolding, or the blueprint
// pipeline — those are separate tools in separate files.

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IFileReader } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { recommendServerPlan } from './recommend-plan';
import { resolveAdoptionStrategy } from './adoption-strategy';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import {
	ANALYZE_INPUT_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from './schemas';
import { toolJson } from '../shared/tool-response';
import { ADOPTION_STRATEGY_SCHEMA } from '../contracts/constants/adoption-strategy-schema.constant';

export interface IAnalyzeToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly patternOverrides?: IPatternOverrides;
}

const json = (value: unknown) => toolJson(value);

export const buildAnalyzeToolRegistration = (
	deps: IAnalyzeToolDeps,
): IToolRegistration => {
	const prefix = deps.namespacePrefix;
	return {
		id: 'analyze_project',
		summary:
			'Read-only: inspect the project and recommend an MCP server plan (type, tools, plugins, mcp.json).',
		tags: ['orientation', 'bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_analyze_project`,
				{
					outputSchema: z.object({
						analysis: PROJECT_ANALYSIS_SCHEMA.optional(),
						plan: SERVER_PLAN_SCHEMA.optional(),
						adoptionStrategy: ADOPTION_STRATEGY_SCHEMA,
						summary: z
							.object({
								projectType:
									PROJECT_ANALYSIS_SCHEMA.shape.projectType,
								language:
									PROJECT_ANALYSIS_SCHEMA.shape.language,
								packageManager:
									PROJECT_ANALYSIS_SCHEMA.shape
										.packageManager,
								framework: z.string().optional(),
								hasMcpProject: z.boolean(),
								serverName: z.string(),
								namespacePrefix: z.string(),
								pluginCount: z.number(),
								toolCount: z.number(),
							})
							.optional(),
					}),
					description:
						'Read-only. Inspect this project and return a structured analysis plus a recommended MCP server plan (project type, tools, plugins, validation commands and a ready-to-paste mcp.json). Call this first; it never writes.',
					inputSchema: ANALYZE_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof ANALYZE_INPUT_SCHEMA>) => {
					const analysis = await analyzeProject(deps.reader);
					const adoptionStrategy = resolveAdoptionStrategy(
						args.adoption ?? {},
						{ hasExistingMcpProject: analysis.hasMcpProject },
					);
					const planOptions = {
						...(args.serverName !== undefined
							? { serverName: args.serverName }
							: {}),
						...(args.namespacePrefix !== undefined
							? { namespacePrefix: args.namespacePrefix }
							: {}),
						...(args.cacheDir !== undefined
							? { cacheDir: args.cacheDir }
							: {}),
						...(args.docsDir !== undefined
							? { docsDir: args.docsDir }
							: {}),
						...(deps.patternOverrides !== undefined
							? { patternOverrides: deps.patternOverrides }
							: {}),
					};
					const plan = recommendServerPlan(analysis, planOptions);
					if (args.compact === true) {
						return json({
							adoptionStrategy,
							summary: {
								projectType: analysis.projectType,
								language: analysis.language,
								packageManager: analysis.packageManager,
								...(analysis.framework === undefined
									? {}
									: { framework: analysis.framework }),
								hasMcpProject: analysis.hasMcpProject,
								serverName: plan.serverName,
								namespacePrefix: plan.namespacePrefix,
								pluginCount: plan.plugins.length,
								toolCount: plan.tools.length,
							},
						});
					}
					return json({ analysis, plan, adoptionStrategy });
				},
			);
		},
	};
};
