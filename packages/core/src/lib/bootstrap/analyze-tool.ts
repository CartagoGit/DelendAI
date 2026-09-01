// analyze-tool: the `<prefix>_analyze_project` MCP tool.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// tool that returns `{ analysis, plan }` for the current workspace.
// It does not know about drift, scaffolding, or the blueprint
// pipeline — those are separate tools in separate files.

import type z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IFileReader, IProjectAnalysis } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { recommendServerPlan } from './recommend-plan';
import { resolveAdoptionStrategy } from './adoption-strategy';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import { ANALYZE_INPUT_SCHEMA } from './schemas';
import { toolJson } from '../shared/tool-response';
import { compactOutputSchema } from '../surface/compact-output-schema.helper';

export interface IAnalyzeToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly analyze?: () => Promise<IProjectAnalysis>;
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
					// v00129 S1 (AUD-B01): the full analysis+plan schema cost
					// ~4.2 KB per tools/list entry for a shape the model
					// needs only after calling (and only when full:true is
					// explicitly requested). See compact-output-schema.ts.
					outputSchema: compactOutputSchema(),
					description:
						'Read-only. Inspect this project and recommend an MCP server plan. Returns a bounded summary by DEFAULT; pass full:true for the complete analysis and plan (project type, tools, plugins, validation commands and a ready-to-paste mcp.json). Call this first; it never writes.',
					inputSchema: ANALYZE_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof ANALYZE_INPUT_SCHEMA>) => {
					const analysis = await (deps.analyze?.() ??
						analyzeProject(deps.reader));
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
						...(args.targetDir !== undefined
							? { targetDir: args.targetDir }
							: {}),
						...(args.adoption === undefined
							? {}
							: { adoption: args.adoption }),
						...(deps.patternOverrides !== undefined
							? { patternOverrides: deps.patternOverrides }
							: {}),
					};
					const plan = recommendServerPlan(analysis, planOptions);
					// x00101: compact is the DEFAULT (12 933 B full vs 873 B
					// summary measured against this repo); `full: true` (or
					// legacy `compact: false`) opts in to the whole payload.
					const wantsFull =
						args.full === true || args.compact === false;
					if (!wantsFull) {
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
								targetDir: plan.targetDir,
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
