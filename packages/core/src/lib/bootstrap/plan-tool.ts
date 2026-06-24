// plan-tool: the `<prefix>_plan_mcp_project` MCP tool — the EXHAUSTIVE
// plan for a project-specific MCP server.
//
// SOLID — Single Responsibility. Owns the tool that returns
// `{ blueprint, files }` from the blueprint pipeline. It does not
// know about drift, analysis, or the file system — it composes the
// pure `buildServerBlueprint` + `buildBlueprintFiles` over the
// project analysis.

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IFileReader } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { buildBlueprintFiles, buildServerBlueprint } from './build-blueprint';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import {
	PLAN_INPUT_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
} from './schemas';
import { toolJson } from '../shared/tool-response';

export interface IPlanToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly patternOverrides?: IPatternOverrides;
}

const json = (value: unknown) => toolJson(value);

export const buildPlanToolRegistration = (
	deps: IPlanToolDeps,
): IToolRegistration => {
	const prefix = deps.namespacePrefix;
	return {
		id: 'plan_mcp_project',
		summary:
			'EXHAUSTIVE plan for a project-specific MCP server (all tools/prompts/skills/agents + tests) and the files to write.',
		tags: ['bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_plan_mcp_project`,
				{
					outputSchema: z.object({
						blueprint: SERVER_BLUEPRINT_SCHEMA,
						files: z.array(SCAFFOLDED_FILE_SCHEMA),
					}),
					description:
						'Read-only. Analyze this project and return an EXHAUSTIVE blueprint for a project-specific MCP server — every tool, prompt, skill and agent worth creating (with tests by default), plus the files to write. If a server already exists, the notes explain how to integrate it with mcp-vertex instead of replacing it.',
					inputSchema: PLAN_INPUT_SCHEMA,
				},
				async (args: {
					tests?: boolean | undefined;
					namespacePrefix?: string | undefined;
					serverName?: string | undefined;
				}) => {
					const analysis = await analyzeProject(deps.reader);
					const blueprint = buildServerBlueprint(analysis, {
						...(args.tests !== undefined
							? { tests: args.tests }
							: {}),
						...(args.namespacePrefix !== undefined
							? { namespacePrefix: args.namespacePrefix }
							: {}),
						...(args.serverName !== undefined
							? { serverName: args.serverName }
							: {}),
						...(deps.patternOverrides !== undefined
							? { patternOverrides: deps.patternOverrides }
							: {}),
					});
					return json({
						blueprint,
						files: buildBlueprintFiles(blueprint),
					});
				},
			);
		},
	};
};
