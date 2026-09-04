// plan-tool: the `<prefix>_plan_mcp_project` MCP tool — the EXHAUSTIVE
// plan for a project-specific MCP server.
//
// SOLID — Single Responsibility. Owns the tool that returns
// `{ blueprint, files }` from the blueprint pipeline. It does not
// know about drift, analysis, or the file system — it composes the
// pure `buildServerBlueprint` + `buildBlueprintFiles` over the
// project analysis.

import type z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IFileReader, IProjectAnalysis } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { buildBlueprintFiles, buildServerBlueprint } from './build-blueprint';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import { PLAN_INPUT_SCHEMA } from './schemas';
import { toolJson } from '../shared/tool-response';
import { compactOutputSchema } from '../surface/compact-output-schema.helper';

export interface IPlanToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly analyze?: () => Promise<IProjectAnalysis>;
	readonly patternOverrides?: IPatternOverrides;
}

const json = (value: unknown) => toolJson(value);

const compactResult = (
	blueprint: ReturnType<typeof buildServerBlueprint>,
	args: z.infer<typeof PLAN_INPUT_SCHEMA>,
) => {
	const summary = {
		serverName: blueprint.serverName,
		namespacePrefix: blueprint.namespacePrefix,
		targetDir: blueprint.targetDir,
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
					// v00129 S1 (AUD-B01): the full nested blueprint/files
					// schema cost ~5.2 KB per tools/list entry for a shape
					// the model needs only after calling (and only when
					// full:true is explicitly requested). See
					// compact-output-schema.ts.
					outputSchema: compactOutputSchema(),
					description:
						'Read-only. Analyze this project and plan a project-specific MCP server. Returns a bounded compact summary by DEFAULT (page detail with section/cursor/limit over tools, prompts, skills, agents, files or notes); pass full:true only when you need the EXHAUSTIVE blueprint plus every file to write (hundreds of KB on real projects). If a server already exists, the notes explain how to integrate it with delendai instead of replacing it.',
					inputSchema: PLAN_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof PLAN_INPUT_SCHEMA>) => {
					const analysis = await (deps.analyze?.() ??
						analyzeProject(deps.reader));
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
						...(args.targetDir !== undefined
							? { targetDir: args.targetDir }
							: {}),
						...(args.adoption === undefined
							? {}
							: { adoption: args.adoption }),
						...(deps.patternOverrides !== undefined
							? { patternOverrides: deps.patternOverrides }
							: {}),
					});
					// x00101: compact is the DEFAULT — the exhaustive payload
					// measured 205 963 B (~51k tokens) against this repo, so
					// it must be an explicit opt-in (`full: true`; legacy
					// `compact: false` behaves the same).
					const wantsFull =
						args.full === true || args.compact === false;
					if (!wantsFull) return json(compactResult(blueprint, args));
					return json({
						blueprint,
						files: buildBlueprintFiles(blueprint),
					});
				},
			);
		},
	};
};
