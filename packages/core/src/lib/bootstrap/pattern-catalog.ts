import type { IProjectType } from './analyze-project';

export interface IRecommendedTool {
	readonly name: string;
	readonly description: string;
}

/**
 * The data behind "knowing what an optimal MCP server needs" for a
 * project, without anyone telling the agent. One entry per project
 * type maps to the tools, plugins and guidance that suit it. Extend
 * this catalog to teach the analyzer about new project shapes.
 */
export interface IProjectPattern {
	readonly type: IProjectType;
	readonly describe: string;
	/** Project-specific tools worth scaffolding (namespaced at use). */
	readonly recommendedTools: readonly IRecommendedTool[];
	/** mcp-vertex plugins worth loading via `--plugins`. */
	readonly recommendedPlugins: readonly string[];
	/** Short guidance lines surfaced to the agent. */
	readonly knowledgeHints: readonly string[];
}

const COMMON_TOOLS: readonly IRecommendedTool[] = [
	{
		name: 'check_project_state',
		description:
			'Single source of truth the agent calls first each turn: returns conventions, gates and what to do next.',
	},
	{
		name: 'get_validation_matrix',
		description: 'Returns the quality-gate commands per scope.',
	},
];

export const PROJECT_PATTERN_CATALOG: Readonly<
	Record<IProjectType, IProjectPattern>
> = {
	library: {
		type: 'library',
		describe:
			'A publishable package; correctness and public API stability matter most.',
		recommendedTools: [
			...COMMON_TOOLS,
			{
				name: 'audit_public_api',
				description: 'Flags breaking changes to the exported surface.',
			},
		],
		recommendedPlugins: ['rules'],
		knowledgeHints: [
			'Guard the public barrel; treat exports as a contract.',
			'Run typecheck + tests as the gate before publish.',
		],
	},
	cli: {
		type: 'cli',
		describe:
			'A command-line tool; argument contracts and help output matter.',
		recommendedTools: [
			...COMMON_TOOLS,
			{
				name: 'run_command',
				description:
					'Executes the CLI in a sandbox and returns structured output.',
			},
		],
		recommendedPlugins: [],
		knowledgeHints: ['Keep arg parsing and exit codes covered by tests.'],
	},
	webapp: {
		type: 'webapp',
		describe:
			'A web application; component structure and build/test gates matter.',
		recommendedTools: [
			...COMMON_TOOLS,
			{
				name: 'run_quality',
				description:
					'Runs lint/test/build and returns a structured pass/fail report.',
			},
		],
		recommendedPlugins: ['rules'],
		knowledgeHints: [
			'Prefer the framework idioms already in the repo.',
			'Wire build + test as the gate.',
		],
	},
	game: {
		type: 'game',
		describe:
			'A game project; scene/asset authoring and a runtime loop matter.',
		recommendedTools: [
			...COMMON_TOOLS,
			{
				name: 'validate_scene',
				description:
					'Validates a scene/level document against the engine schema.',
			},
		],
		recommendedPlugins: ['rules'],
		knowledgeHints: [
			'Author content through validated tools, never raw edits.',
		],
	},
	monorepo: {
		type: 'monorepo',
		describe:
			'A multi-package workspace; per-scope gates and coordination matter.',
		recommendedTools: [
			...COMMON_TOOLS,
			{
				name: 'run_quality',
				description:
					'Runs the per-scope validation matrix across packages.',
			},
		],
		recommendedPlugins: ['rules'],
		knowledgeHints: [
			'Scope gates per package; coordinate parallel work cleanly.',
		],
	},
	generic: {
		type: 'generic',
		describe: 'An unrecognised project; start from the common tool set.',
		recommendedTools: COMMON_TOOLS,
		recommendedPlugins: [],
		knowledgeHints: ['Add project-specific tools as patterns emerge.'],
	},
};
