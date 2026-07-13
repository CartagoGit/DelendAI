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
import { ADOPTION_STRATEGY_SCHEMA } from '../contracts/constants/adoption-strategy-schema.constant';

export interface IPlanToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly patternOverrides?: IPatternOverrides;
}

const json = (value: unknown) => toolJson(value);

const compactSummarySchema = z.object({
	serverName: z.string(),
	namespacePrefix: z.string(),
	projectType: z.string(),
	plugins: z.array(z.string()),
	counts: z.object({
		tools: z.number(),
		prompts: z.number(),
		skills: z.number(),
		agents: z.number(),
	}),
	tests: z.boolean(),
	hasExistingServer: z.boolean(),
	adoptionStrategy: ADOPTION_STRATEGY_SCHEMA,
});

const compactDetailSchema = z.object({
	section: z.enum(['tools', 'prompts', 'skills', 'agents', 'files', 'notes']),
	cursor: z.number(),
	nextCursor: z.number().nullable(),
	total: z.number(),
	items: z.array(z.unknown()),
});

const compactResult = (
	blueprint: ReturnType<typeof buildServerBlueprint>,
	args: z.infer<typeof PLAN_INPUT_SCHEMA>,
) => {
	const summary = {
		serverName: blueprint.serverName,
		namespacePrefix: blueprint.namespacePrefix,
		projectType: blueprint.projectType,
		plugins: blueprint.plugins,
		counts: {
			tools: blueprint.tools.length,
			prompts: blueprint.prompts.length,
			skills: blueprint.skills.length,
			agents: blueprint.agents.length,
		},
		tests: blueprint.tests,
		hasExistingServer: blueprint.hasExistingServer,
		adoptionStrategy: blueprint.adoptionStrategy,
	};
	if (args.section === undefined) return { summary };
	const collection: readonly unknown[] =
		args.section === 'files'
			? buildBlueprintFiles(blueprint)
			: blueprint[args.section];
	const cursor = Math.min(args.cursor ?? 0, collection.length);
	const limit = args.limit ?? 20;
	const end = Math.min(cursor + limit, collection.length);
	return {
		summary,
		detail: {
			section: args.section,
			cursor,
			nextCursor: end < collection.length ? end : null,
			total: collection.length,
			items: collection.slice(cursor, end),
		},
	};
};

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
						blueprint: SERVER_BLUEPRINT_SCHEMA.optional(),
						files: z.array(SCAFFOLDED_FILE_SCHEMA).optional(),
						summary: compactSummarySchema.optional(),
						detail: compactDetailSchema.optional(),
					}),
					description:
						'Read-only. Analyze this project and return an EXHAUSTIVE blueprint for a project-specific MCP server — every tool, prompt, skill and agent worth creating (with tests by default), plus the files to write. If a server already exists, the notes explain how to integrate it with mcp-vertex instead of replacing it.',
					inputSchema: PLAN_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof PLAN_INPUT_SCHEMA>) => {
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
						...(args.adoption === undefined
							? {}
							: { adoption: args.adoption }),
						...(deps.patternOverrides !== undefined
							? { patternOverrides: deps.patternOverrides }
							: {}),
					});
					if (args.compact === true)
						return json(compactResult(blueprint, args));
					return json({
						blueprint,
						files: buildBlueprintFiles(blueprint),
					});
				},
			);
		},
	};
};
