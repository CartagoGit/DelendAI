import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IProjectAnalysis } from './analyze-project';
import { resolvePatternCatalog } from './pattern-catalog-overrides';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import type { IRecommendedTool } from './pattern-catalog';

export interface IServerPlanOptions {
	readonly serverName?: string;
	readonly namespacePrefix?: string;
	readonly cacheDir?: string;
	readonly docsDir?: string;
	/**
	 * Optional host-defined pattern overrides (see
	 * `pattern-catalog-overrides.ts`). When omitted, the hardcoded
	 * `PROJECT_PATTERN_CATALOG` is used.
	 */
	readonly patternOverrides?: IPatternOverrides;
}

export interface IServerPlan {
	readonly projectType: IProjectAnalysis['projectType'];
	readonly serverName: string;
	readonly namespacePrefix: string;
	/** mcp-vertex plugins to load via `--plugins`. */
	readonly plugins: readonly string[];
	/** Project-specific tools to scaffold. */
	readonly tools: readonly IRecommendedTool[];
	/** Suggested quality-gate commands, by role. */
	readonly validationCommands: Readonly<Record<string, string>>;
	readonly cacheDir: string;
	readonly docsDir: string;
	/** A ready-to-paste mcp.json server entry. */
	readonly mcpJson: Readonly<Record<string, unknown>>;
	/** Human + agent guidance for executing the plan. */
	readonly notes: readonly string[];
}

const kebabHead = (name: string | undefined): string => {
	if (!name) return 'app';
	const cleaned = name
		.replace(/^@[^/]+\//, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const head = cleaned.split('-')[0];
	return head && head.length > 0 ? head : 'app';
};

const runner = (analysis: IProjectAnalysis): string => {
	switch (analysis.packageManager) {
		case 'bun':
			return 'bun run';
		case 'pnpm':
			return 'pnpm';
		case 'yarn':
			return 'yarn';
		default:
			return 'npm run';
	}
};

const buildValidationCommands = (
	analysis: IProjectAnalysis,
): Record<string, string> => {
	const prefix = runner(analysis);
	const out: Record<string, string> = {};
	for (const [role, script] of Object.entries(analysis.scripts)) {
		out[role] = `${prefix} ${role}`.trim();
		void script;
	}
	return out;
};

/**
 * Turn an analysis into a concrete, editable server plan. Pure: the
 * agent reviews the plan, tweaks names/plugins if needed, then asks
 * `create_project` to materialise it. The plan is the "what an optimal
 * MCP server needs here" recommendation, derived from the pattern
 * catalog — no human had to spell it out.
 */
export const recommendServerPlan = (
	analysis: IProjectAnalysis,
	options: IServerPlanOptions = {},
): IServerPlan => {
	const catalog = resolvePatternCatalog(options.patternOverrides);
	const pattern = catalog[analysis.projectType];
	const namespacePrefix = options.namespacePrefix ?? kebabHead(analysis.name);
	const serverName = options.serverName ?? `mcp-project-${namespacePrefix}`;
	const cacheDir = options.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir;
	const docsDir = options.docsDir ?? DEFAULT_CORE_PATHS.docsDir;
	const plugins = pattern.recommendedPlugins;

	const args = ['@mcp-vertex/core'];
	if (plugins.length > 0) args.push(`--plugins=${plugins.join(',')}`);
	if (cacheDir !== DEFAULT_CORE_PATHS.cacheDir)
		args.push(`--cacheDir=${cacheDir}`);
	if (docsDir !== DEFAULT_CORE_PATHS.docsDir)
		args.push(`--docsDir=${docsDir}`);
	if (options.namespacePrefix) args.push(`--prefix=${namespacePrefix}`);

	const notes: string[] = [
		...pattern.knowledgeHints,
		analysis.hasMcpProject
			? 'This project already has an MCP server: prefer adding the recommended tools to it over scaffolding a new one.'
			: 'No MCP server found: scaffold a fresh one with `create_project`, then register it in mcp.json.',
	];

	return {
		projectType: analysis.projectType,
		serverName,
		namespacePrefix,
		plugins,
		tools: pattern.recommendedTools,
		validationCommands: buildValidationCommands(analysis),
		cacheDir,
		docsDir,
		mcpJson: {
			servers: {
				[serverName]: { command: 'bunx', args },
			},
		},
		notes,
	};
};
