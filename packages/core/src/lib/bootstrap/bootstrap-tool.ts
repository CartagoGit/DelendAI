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
import {
	buildBlueprintFiles,
	buildServerBlueprint,
} from './build-blueprint';
import { recommendServerPlan } from './recommend-plan';

export interface IBootstrapToolOptions {
	readonly workspace: IWorkspacePathProvider;
	/** Namespace for the bootstrap tools, e.g. `mcpcore`. */
	readonly namespacePrefix: string;
	/** Override the reader (tests); default reads from the workspace. */
	readonly reader?: IFileReader;
}

/** A read-only reader backed by the workspace filesystem. */
export const createWorkspaceFileReader = (
	workspace: IWorkspacePathProvider
): IFileReader => ({
	readFile: (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
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

const CREATE_SCHEMA = z.object({
	kind: z
		.enum(['host', 'plugin', 'client'])
		.optional()
		.describe('What to scaffold.'),
	projectName: z.string().optional(),
	namespacePrefix: z.string().optional(),
	serverPackageName: z.string().optional(),
	pluginName: z.string().optional().describe('Plugin id (kind "plugin").'),
	clientName: z.string().optional().describe('Client id (kind "client").'),
	description: z.string().optional(),
});

const json = (value: unknown) => ({
	content: [
		{ type: 'text' as const, text: JSON.stringify(value) },
	],
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
 * spelling it out. `create_server` turns a plan into scaffolded files
 * (dry-run: the agent writes them). The server recommends and
 * generates content; the agent decides and writes.
 */
export const buildBootstrapToolRegistrations = (
	options: IBootstrapToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const reader = options.reader ?? createWorkspaceFileReader(options.workspace);

	const analyze: IToolRegistration = {
		id: 'analyze_project',
		summary:
			'Read-only: inspect the project and recommend an MCP server plan (type, tools, plugins, mcp.json).',
		tags: ['orientation', 'bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_analyze_project`,
				{
						outputSchema: z.object({}).catchall(z.unknown()),
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
				}
			);
		},
	};

	const create: IToolRegistration = {
		id: 'create_server',
		summary:
			'Generate files for a project-specific server, plugin or MCP client from a plan (returns files for you to write).',
		tags: ['bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_create_server`,
				{
						outputSchema: z.object({}).catchall(z.unknown()),
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
								args.description ?? 'TODO: describe this plugin.',
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
						serverPackageName:
							args.serverPackageName ??
							`@${namespacePrefix}/mcp-server`,
					});
					return json({ kind: 'host', files });
				}
			);
		},
	};

	const planServer: IToolRegistration = {
		id: 'plan_mcp_server',
		summary:
			'EXHAUSTIVE plan for a project-specific MCP server (all tools/prompts/skills/agents + tests) and the files to write.',
		tags: ['bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_plan_mcp_server`,
				{
						outputSchema: z.object({}).catchall(z.unknown()),
					description:
						'Read-only. Analyze this project and return an EXHAUSTIVE blueprint for a project-specific MCP server — every tool, prompt, skill and agent worth creating (with tests by default), plus the files to write. If a server already exists, the notes explain how to integrate it with mcp-core instead of replacing it.',
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
						...(args.tests !== undefined ? { tests: args.tests } : {}),
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
				}
			);
		},
	};

	return [analyze, planServer, create];
};
