import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import {
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
} from '../scaffold/scaffold-host';
import { analyzeProject } from './analyze-project';
import type { IFileReader } from './analyze-project';
import { buildBlueprintFiles, buildServerBlueprint } from './build-blueprint';
import { recommendServerPlan } from './recommend-plan';

export interface IBootstrapToolOptions {
	readonly workspace: IWorkspacePathProvider;
	/** Namespace for the bootstrap tools, e.g. `mcpvertex`. */
	readonly namespacePrefix: string;
	/** Override the reader (tests); default reads from the workspace. */
	readonly reader?: IFileReader;
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

// l00007 S1 — mirrors `IProjectAnalysis` (analyze-project.ts).
const PROJECT_ANALYSIS_SCHEMA = z.object({
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

// l00007 S1 — mirrors `IServerPlan` (recommend-plan.ts).
const SERVER_PLAN_SCHEMA = z.object({
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

// l00007 S1 — mirrors `IScaffoldedFile` (scaffold-host.ts).
const SCAFFOLDED_FILE_SCHEMA = z.object({
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

// l00007 S1 — `create_project`'s output: a dry-run skeleton of files to
// write, discriminated by what was scaffolded (host/plugin/client).
const MCP_PROJECT_SKELETON_SCHEMA = z.object({
	kind: z.enum(['host', 'plugin', 'client']),
	files: z.array(SCAFFOLDED_FILE_SCHEMA),
});

// l00007 S1 — mirrors `IServerBlueprint` (build-blueprint.ts), the
// EXHAUSTIVE plan `plan_mcp_project` returns alongside the files to write.
const BLUEPRINT_ARTIFACT_SCHEMA = z.object({
	name: z.string(),
	description: z.string(),
});

const SERVER_BLUEPRINT_SCHEMA = z.object({
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
					});
					return json({
						blueprint,
						files: buildBlueprintFiles(blueprint),
					});
				},
			);
		},
	};

	return [analyze, planServer, create];
};
