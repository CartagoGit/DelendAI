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
import type { IPatternOverrides } from './pattern-catalog-overrides';
import {
	ANALYZE_INPUT_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from './schemas';
import { toolJson } from '../shared/tool-response';

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
						analysis: PROJECT_ANALYSIS_SCHEMA,
						plan: SERVER_PLAN_SCHEMA,
					}),
					description:
						'Read-only. Inspect this project and return a structured analysis plus a recommended MCP server plan (project type, tools, plugins, validation commands and a ready-to-paste mcp.json). Call this first; it never writes.',
					inputSchema: ANALYZE_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof ANALYZE_INPUT_SCHEMA>) => {
					const analysis = analyzeProject(deps.reader);
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
					return json({
						analysis,
						plan: recommendServerPlan(analysis, planOptions),
					});
				},
			);
		},
	};
};
