import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import {
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
} from '../scaffold/scaffold-host';
import { analyzeProject } from './analyze-project';
import type { IFileReader } from './analyze-project';
import { buildBlueprintFiles, buildServerBlueprint } from './build-blueprint';
import { recommendServerPlan } from './recommend-plan';
import { diffAnalysis } from './drift';
import type { IDriftReport } from './drift';
import { loadDriftSnapshot, saveDriftSnapshot } from './drift-store';
import type { IPatternOverrides } from './pattern-catalog-overrides';

export interface IBootstrapToolOptions {
	readonly workspace: IWorkspacePathProvider;
	/** Namespace for the bootstrap tools, e.g. `mcpvertex`. */
	readonly namespacePrefix: string;
	/**
	 * Workspace-relative cache root, e.g. `.cache/mcp-vertex`. The
	 * `drift_check` tool uses it to read/write the last-analysis
	 * snapshot. Defaults to `.cache/mcp-vertex` when omitted.
	 */
	readonly cacheDir?: string;
	/** Override the reader (tests); default reads from the workspace. */
	readonly reader?: IFileReader;
	/**
	 * Optional host-defined pattern overrides (see
	 * `pattern-catalog-overrides.ts`). Forwarded to `analyze_project`
	 * and `plan_mcp_project` so the bootstrap blueprint adapts to
	 * host-defined project types.
	 */
	readonly patternOverrides?: IPatternOverrides;
}

/** A read-only reader backed by the workspace filesystem. */
export const createWorkspaceFileReader = (
	workspace: IWorkspacePathProvider,
): IFileReader => ({
	readFile: (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		return existsSync(absolute)
			? readFileSync(absolute, 'utf8')
			: undefined;
	},
	exists: (relativePath) => existsSync(workspace.resolve(relativePath)),
	listDir: (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		try {
			return readdirSync(absolute);
		} catch {
			return [];
		}
	},
});

// Schemas live in their own module so the tool file owns only
// behaviour (handlers + factory). Every schema below is a
// backwards-compat re-export — the canonical definitions live in
// `bootstrap-schemas.ts`.
import {
	ANALYZE_SCHEMA,
	CREATE_SCHEMA,
	DRIFT_REPORT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from './bootstrap-schemas';

export {
	ANALYZE_SCHEMA,
	BLUEPRINT_ARTIFACT_SCHEMA,
	CREATE_SCHEMA,
	DRIFT_REPORT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from './bootstrap-schemas';

const json = (value: unknown) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(value) }],
	// MCP modern structuredContent so the declared outputSchema is satisfied
	// (the SDK validates it on success). Object payloads only.
	...(typeof value === 'object' && value !== null && !Array.isArray(value)
		? { structuredContent: value as Record<string, unknown> }
		: {}),
});

/**
 * The hybrid bootstrap tools. `analyze_project` reads the target repo
 * (read-only) and returns an analysis plus a recommended server plan —
 * "what an optimal MCP server needs here", derived without anyone
 * spelling it out. `create_project` turns a plan into scaffolded files
 * (dry-run: the agent writes them). The server recommends and
 * generates content; the agent decides and writes.
 */
export const buildBootstrapToolRegistrations = (
	options: IBootstrapToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const reader =
		options.reader ?? createWorkspaceFileReader(options.workspace);

	const analyze: IToolRegistration = {
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
					inputSchema: ANALYZE_SCHEMA,
				},
				async (args: z.infer<typeof ANALYZE_SCHEMA>) => {
					const analysis = analyzeProject(reader);
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
						...(options.patternOverrides !== undefined
							? { patternOverrides: options.patternOverrides }
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

	const create: IToolRegistration = {
		id: 'create_project',
		summary:
			'Generate files for a project-specific server, plugin or MCP client from a plan (returns files for you to write).',
		tags: ['bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_create_project`,
				{
					outputSchema: MCP_PROJECT_SKELETON_SCHEMA,
					description:
						'Generate the files for a project-specific MCP server (or a new plugin) from a plan. Returns the files for YOU to write — it does not touch disk. Run analyze_project first to get a plan, edit it if needed, then call this.',
					inputSchema: CREATE_SCHEMA,
				},
				async (args: z.infer<typeof CREATE_SCHEMA>) => {
					const namespacePrefix = args.namespacePrefix ?? 'app';
					if (args.kind === 'plugin') {
						const files = scaffoldPluginFiles({
							pluginName: args.pluginName ?? 'example',
							description:
								args.description ??
								'TODO: describe this plugin.',
						});
						return json({ kind: 'plugin', files });
					}
					if (args.kind === 'client') {
						const files = scaffoldClientFiles({
							clientName:
								args.clientName ?? args.pluginName ?? 'example',
							description:
								args.description ??
								'TODO: describe this MCP client.',
						});
						return json({ kind: 'client', files });
					}
					const files = scaffoldHostProject({
						projectName: args.projectName ?? namespacePrefix,
						namespacePrefix,
						projectPackageName:
							args.projectPackageName ??
							`@${namespacePrefix}/mcp-project`,
					});
					return json({ kind: 'host', files });
				},
			);
		},
	};

	const planServer: IToolRegistration = {
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
					inputSchema: z.object({
						tests: z.boolean().optional(),
						namespacePrefix: z.string().optional(),
						serverName: z.string().optional(),
					}),
				},
				async (args: {
					tests?: boolean | undefined;
					namespacePrefix?: string | undefined;
					serverName?: string | undefined;
				}) => {
					const analysis = analyzeProject(reader);
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
						...(options.patternOverrides !== undefined
							? { patternOverrides: options.patternOverrides }
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

	const driftCheck: IToolRegistration = {
		id: 'drift_check',
		summary:
			'Diff the current project analysis against the last persisted snapshot — flags new scripts, dropped deps, framework changes and the missing tools they imply.',
		tags: ['bootstrap', 'drift'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_drift_check`,
				{
					outputSchema: DRIFT_REPORT_SCHEMA,
					description:
						'Read-write. Compare the current project analysis against the last snapshot persisted under `<cacheDir>/drift/last-analysis.json` and return a structured report of what changed (new/removed scripts, framework upgrades, CI changes, MCP server presence, …). Persists the new snapshot at the end so the next call sees it as the baseline. Use this after a code change to find out whether the bootstrap plan is now stale.',
					inputSchema: z.object({
						persist: z
							.boolean()
							.optional()
							.describe(
								'Default true: write the new analysis as the new baseline. Pass false to peek without updating.',
							),
					}),
				},
				async (args: { persist?: boolean | undefined }) => {
					const analysis = analyzeProject(reader);
					const persist = args.persist ?? true;
					const { snapshot, corruptBackupPath } =
						await loadDriftSnapshot(
							options.workspace,
							options.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
						);
					const baseReport: IDriftReport = diffAnalysis(
						analysis,
						snapshot?.analysis,
						snapshot?.savedAt ?? null,
					);
					if (persist) {
						await saveDriftSnapshot(
							options.workspace,
							options.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
							analysis,
						);
					}
					// `corruptBackupPath` is a private signal (not part of
					// the public outputSchema) so we surface it as a
					// diagnostic line in the text payload, where the agent
					// can still see it without breaking schema validation.
					const report: IDriftReport = baseReport;
					const text =
						corruptBackupPath !== null
							? `${JSON.stringify(report)}\n\n# diagnostic: previous snapshot was corrupt; preserved at ${corruptBackupPath}`
							: JSON.stringify(report);
					return {
						content: [{ type: 'text' as const, text }],
						structuredContent: report as unknown as Record<
							string,
							unknown
						>,
					};
				},
			);
		},
	};

	return [analyze, planServer, create, driftCheck];
};
