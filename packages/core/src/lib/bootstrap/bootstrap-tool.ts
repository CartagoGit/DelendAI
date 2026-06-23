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
import type { IDriftChange, IDriftReport } from './drift';
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

const ANALYZE_SCHEMA = z.object({
	serverName: z.string().optional(),
	namespacePrefix: z.string().optional(),
	cacheDir: z.string().optional(),
	docsDir: z.string().optional(),
});

// r00002 S1 — mirrors `IProjectAnalysis` (analyze-project.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const PROJECT_ANALYSIS_SCHEMA = z.object({
	hasPackageJson: z.boolean(),
	name: z.string().optional(),
	projectType: z.enum([
		'library',
		'cli',
		'webapp',
		'game',
		'monorepo',
		'generic',
	]),
	language: z.enum([
		'typescript',
		'javascript',
		'python',
		'go',
		'rust',
		'unknown',
	]),
	packageManager: z.enum(['bun', 'pnpm', 'yarn', 'npm', 'unknown']),
	framework: z.string().optional(),
	testRunner: z.enum(['vitest', 'jest', 'bun', 'node', 'unknown']),
	monorepoTool: z.string().optional(),
	hasMcpProject: z.boolean(),
	mcpEvidence: z.array(z.string()),
	ci: z.array(z.string()),
	agentConfigs: z.array(z.string()),
	scripts: z.record(z.string(), z.string()),
	signals: z.array(z.string()),
});

// r00002 S1 — mirrors `IServerPlan` (recommend-plan.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SERVER_PLAN_SCHEMA = z.object({
	projectType: PROJECT_ANALYSIS_SCHEMA.shape.projectType,
	serverName: z.string(),
	namespacePrefix: z.string(),
	plugins: z.array(z.string()),
	tools: z.array(z.object({ name: z.string(), description: z.string() })),
	validationCommands: z.record(z.string(), z.string()),
	cacheDir: z.string(),
	docsDir: z.string(),
	mcpJson: z.record(z.string(), z.unknown()),
	notes: z.array(z.string()),
});

// r00002 S1 — mirrors `IScaffoldedFile` (scaffold-host.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SCAFFOLDED_FILE_SCHEMA = z.object({
	path: z.string(),
	content: z.string(),
});

const CREATE_SCHEMA = z.object({
	kind: z
		.enum(['host', 'plugin', 'client'])
		.optional()
		.describe('What to scaffold.'),
	projectName: z.string().optional(),
	namespacePrefix: z.string().optional(),
	projectPackageName: z.string().optional(),
	pluginName: z.string().optional().describe('Plugin id (kind "plugin").'),
	clientName: z.string().optional().describe('Client id (kind "client").'),
	description: z.string().optional(),
});

// r00002 S1 — `create_project`'s output: a dry-run skeleton of files to
// write, discriminated by what was scaffolded (host/plugin/client).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const MCP_PROJECT_SKELETON_SCHEMA = z.object({
	kind: z.enum(['host', 'plugin', 'client']),
	files: z.array(SCAFFOLDED_FILE_SCHEMA),
});

// r00002 S1 — mirrors `IServerBlueprint` (build-blueprint.ts), the
// EXHAUSTIVE plan `plan_mcp_project` returns alongside the files to write.
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const BLUEPRINT_ARTIFACT_SCHEMA = z.object({
	name: z.string(),
	description: z.string(),
});

// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SERVER_BLUEPRINT_SCHEMA = z.object({
	serverName: z.string(),
	namespacePrefix: z.string(),
	projectType: PROJECT_ANALYSIS_SCHEMA.shape.projectType,
	plugins: z.array(z.string()),
	tools: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	prompts: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	skills: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	agents: z.array(z.object({ slot: z.string(), description: z.string() })),
	tests: z.boolean(),
	hasExistingServer: z.boolean(),
	defaults: z.object({
		keepLegacy: z.boolean(),
		reasons: z.array(z.string()),
		warnings: z.array(z.string()),
	}),
	notes: z.array(z.string()),
});

// f00051 S3 — `drift_check` output schema. Mirrors `IDriftReport` (drift.ts).
export const DRIFT_REPORT_SCHEMA = z.object({
	hasDrift: z.boolean(),
	changes: z.array(
		z.object({
			kind: z.enum([
				'script-added',
				'script-dropped',
				'framework-changed',
				'language-changed',
				'monorepo-changed',
				'package-manager-changed',
				'test-runner-changed',
				'mcp-server-added',
				'mcp-server-dropped',
				'ci-changed',
				'agent-config-changed',
			]),
			summary: z.string(),
		}),
	),
	isFirstSnapshot: z.boolean(),
	lastSnapshotAt: z.string().nullable(),
	summary: z.string(),
});

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
