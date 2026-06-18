// host scaffolding kit: "tools to create tools". A project that
// imports mcp-core calls these generators (directly or through the
// `<prefix>_scaffold` MCP tool) to create its OWN MCP server,
// orchestrator and subagent adapters, instructions file, tools,
// prompts and skills — all templated so every agent DELEGATES to the
// project's own MCP server (`<prefix>_overview` first — the universal
// mcp-core entry point), never to a hardcoded host. Templates only name
// tools that exist: `overview` (always, via the mcp-core CLI) and the
// generated scaffold tool; proposal-workflow tools are shown as
// conditional on loading the `proposals` plugin. [M9]

export interface IScaffoldedFile {
	readonly path: string;
	readonly content: string;
}

export interface IScaffoldHostOptions {
	/** Project display name, e.g. `Acme Quest`. */
	readonly projectName: string;
	/** Tool namespace, e.g. `acme` → `acme_*` tools. */
	readonly namespacePrefix: string;
	/** Package that will hold the host server, e.g. `@acme/mcp-server`. */
	readonly serverPackageName: string;
	/** Default agent model id. */
	readonly defaultModel?: string;
}

const SUBAGENT_SLOTS = [
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

export type IScaffoldAgentSlot =
	| 'orchestrator'
	| (typeof SUBAGENT_SLOTS)[number];

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const pascal = (value: string): string =>
	kebab(value)
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');

// ---------------------------------------------------------------------------
// Single-artefact generators
// ---------------------------------------------------------------------------

export const scaffoldToolFile = (
	prefix: string,
	name: string,
	description: string
): IScaffoldedFile => {
	const id = kebab(name);
	const fn = pascal(name);
	const toolName = `${prefix}_${id.replace(/-/g, '_')}`;
	return {
		path: `libs/mcp-server/src/lib/tools/${prefix}-${id}.tool.ts`,
		content: `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const ${toolName.toUpperCase()}_TOOL = {
	name: '${toolName}',
	description: '${description.replace(/'/g, '')}',
} as const;

export const ${toolName.toUpperCase()}_INPUT_SCHEMA = z.object({});

export type I${fn}Args = z.infer<typeof ${toolName.toUpperCase()}_INPUT_SCHEMA>;

export function build${fn}Response(_args: I${fn}Args): {
	content: Array<{ type: 'text'; text: string }>;
} {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify({ tool: '${toolName}', todo: true }, null, '\\t'),
			},
		],
	};
}

export async function register${fn}Tool(server: McpServer): Promise<void> {
	server.registerTool(
		${toolName.toUpperCase()}_TOOL.name,
		{
			description: ${toolName.toUpperCase()}_TOOL.description,
			inputSchema: ${toolName.toUpperCase()}_INPUT_SCHEMA,
		},
		async (args: I${fn}Args) => build${fn}Response(args)
	);
}
`,
	};
};

export const scaffoldPromptFile = (
	prefix: string,
	name: string,
	description: string
): IScaffoldedFile => {
	const id = kebab(name);
	const fn = pascal(name);
	const promptName = `${prefix}-${id}`;
	return {
		path: `libs/mcp-server/src/lib/prompts/${prefix}-${id}.prompt.ts`,
		content: `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const ${prefix.toUpperCase()}_${id.replace(/-/g, '_').toUpperCase()}_PROMPT = {
	name: '${promptName}',
	description: '${description.replace(/'/g, '')}',
} as const;

export async function register${fn}Prompt(server: McpServer): Promise<void> {
	server.registerPrompt(
		'${promptName}',
		{ description: '${description.replace(/'/g, '')}' },
		async () => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: 'Wrapper: call the ${prefix} MCP tools; the server is the source of truth.',
					},
				},
			],
		})
	);
}
`,
	};
};

export const scaffoldSkillFile = (
	prefix: string,
	name: string,
	description: string,
	whenToUse: readonly string[] = []
): IScaffoldedFile => {
	const id = kebab(name);
	const bullets =
		whenToUse.length > 0
			? whenToUse.map((entry) => `- ${entry}`).join('\n')
			: '- TODO: describe when an agent should read this skill.';
	return {
		path: `libs/mcp-server/src/lib/skills/${prefix}-${id}.md`,
		content: `---
id: ${prefix}-${id}
name: ${name}
description: '${description.replace(/'/g, '')}'
---

# ${prefix}-${id}

## When to use this skill

${bullets}

## Quick reference

1. Call \`${prefix}_overview\` first; the MCP payload is the source of truth.
2. TODO: the skill body.

## Checklist

- [ ] TODO
`,
	};
};

export const scaffoldAgentFile = (
	options: IScaffoldHostOptions,
	slot: IScaffoldAgentSlot
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	const model = options.defaultModel ?? '<your-model>';
	const isRoot = slot === 'orchestrator';
	const tools = isRoot
		? `[read, search, edit, execute, todo, agent, mcp-server-${prefix}/*]`
		: `[read, search, edit, execute, todo, mcp-server-${prefix}/*]`;
	return {
		path: `.github/agents/${slot}.agent.md`,
		content: `---
name: ${slot}
display-name: ${pascal(slot)} (${options.projectName})
icon: $(tools)
model: ${model}
description: |
    ${isRoot ? 'Root orchestrator' : 'Bounded subagent'} for ${options.projectName}. The real contract lives in the ${prefix} MCP server.
tools: ${tools}
user-invocable: ${isRoot ? 'true' : 'false'}
---

# ${slot}

This file is only the Copilot adapter; the agent contract lives in \`mcp-server-${prefix}\`.

## Compact lane

1. First call \`${prefix}_overview\` once per turn (tool: \`mcp-server-${prefix}/${prefix}_overview\`); it maps the server's tools/plugins and returns a \`recommendedNextAction\` — follow it. Only call tools that \`overview\` lists.
2. One atomic slice per turn; minimal validation; trust the MCP payload over local re-derivation.
3. When the server loads the \`proposals\` plugin (\`mcp-core --plugins=proposals\`), claim files before writing with \`${prefix}_agent_lock\` and report \`lock-conflict\` instead of retrying; otherwise work with whatever tools \`overview\` reports.
4. A broken global gate outside your ownership is \`external-gate-blocker\`: record evidence and continue with owned work.
`,
	};
};

export const scaffoldInstructionsFile = (
	options: IScaffoldHostOptions
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	return {
		path: '.github/copilot-instructions.md',
		content: `# Copilot Instructions - ${options.projectName}

## Source of truth

The MCP server \`mcp-server-${prefix}\` rules. Do NOT re-derive workflow from docs:

- Entry point: \`${prefix}_overview\` (ALWAYS the first call) — it lists the server's tools, plugins and a \`recommendedNextAction\`.
- The multi-agent proposal workflow (\`${prefix}_continue_proposal\`, \`${prefix}_agent_lock\`, quality gates via \`${prefix}_get_validation_matrix\`) is available when the server loads the \`proposals\` plugin (\`mcp-core --plugins=proposals\`).

## Lane

- Default model: \`${options.defaultModel ?? '<your-model>'}\`.
- MCP payload first, one atomic slice, minimal validation, serial continuity.
- Every final message ends with ONE close marker line (see the close-markers constant of this host).
`,
	};
};

export const scaffoldHostConfigFile = (
	options: IScaffoldHostOptions
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	return {
		path: 'libs/mcp-server/src/lib/shared/host-config.ts',
		content: `import {
	buildScaffoldToolRegistration,
	createWorkspacePathProvider,
} from '@mcp-vertex/core/public';
import type { IMcpCoreHostConfig } from '@mcp-vertex/core/public';

// The core is project-agnostic. Add domain behaviour (e.g. a proposal
// workflow) by loading a plugin via the mcp-core CLI
// (\`mcp-core --plugins=proposals\`) rather than wiring it here.
// Hermetic: the workspace root is injected by the caller (the server
// entry point), never read from \`process.cwd()\` here — a lib must not
// guess where the project lives, so this stays correct under CI,
// containers and tests.
export const buildHostConfig = (workspaceRoot: string): IMcpCoreHostConfig => {
	const workspace = createWorkspacePathProvider(workspaceRoot);
	return {
		metadata: {
			name: 'mcp-server-${prefix}',
			version: '0.0.1',
			description: '${options.projectName} workspace MCP server (built on mcp-core).',
		},
		namespacePrefix: '${prefix}',
		workspace,
		validationMatrix: { scopes: {} },
		extraTools: [
			// Your project tools register here. The scaffold tool lets
			// agents generate more of them.
			buildScaffoldToolRegistration({
				namespacePrefix: '${prefix}',
				workspace,
				projectName: '${options.projectName}',
				serverPackageName: '${options.serverPackageName}',
			}),
		],
	};
};
`,
	};
};

export const scaffoldServerEntryFiles = (
	options: IScaffoldHostOptions
): readonly IScaffoldedFile[] => [
	{
		path: 'libs/mcp-server/src/server.ts',
		content: `import { createMcpServer } from '@mcp-vertex/core/public';

import { buildHostConfig } from './lib/shared/host-config';

// The entry point is the ONE place allowed to read the launch directory
// (like mcp-core's own CLI). It resolves the workspace root and injects
// it into the (hermetic) host config.
export async function startServer(workspaceRoot = process.cwd()): Promise<void> {
	const assembled = await createMcpServer(buildHostConfig(workspaceRoot));
	await assembled.start();
}
`,
	},
	{
		path: 'libs/mcp-server/src/index.ts',
		content: `import { startServer } from './server';

void startServer();
`,
	},
	{
		path: '.vscode/mcp.json',
		content: `${JSON.stringify(
			{
				servers: {
					[`mcp-server-${options.namespacePrefix}`]: {
						command: 'bun',
						args: ['--watch', 'run', 'src/index.ts'],
						// biome-ignore lint/suspicious/noTemplateCurlyInString: literal VSCode ${workspaceFolder} variable, not a JS template
						cwd: '${workspaceFolder}/libs/mcp-server',
					},
				},
			},
			null,
			'\t'
		)}
`,
	},
];

/**
 * Everything a brand-new project needs: server entry + host config +
 * editor registration + orchestrator + 4 subagents + instructions +
 * a starter skill.
 */
export const scaffoldHostProject = (
	options: IScaffoldHostOptions
): readonly IScaffoldedFile[] => [
	scaffoldHostConfigFile(options),
	...scaffoldServerEntryFiles(options),
	scaffoldAgentFile(options, 'orchestrator'),
	...SUBAGENT_SLOTS.map((slot) => scaffoldAgentFile(options, slot)),
	scaffoldInstructionsFile(options),
	scaffoldSkillFile(
		options.namespacePrefix,
		'project-standards',
		`Closed stack and conventions of ${options.projectName}.`
	),
];

// ---------------------------------------------------------------------------
// Plugin generator — "mcp-core knows how to create plugins"
// ---------------------------------------------------------------------------

export interface IScaffoldPluginOptions {
	/** Plugin id, also the tool namespace and cache dir, e.g. `pepegrillo`. */
	readonly pluginName: string;
	/** One-line, model-agnostic description of what the plugin adds. */
	readonly description: string;
	/** npm scope for the package name (default `@cartago-git`). */
	readonly scope?: string;
}

/**
 * Generate a ready-to-load plugin package implementing `IMcpPlugin`.
 * The result is loadable with `mcp-core --plugins=<pluginName>` once
 * published or linked. Tools are namespaced by the plugin name and
 * return structured JSON so any agent/model can consume them.
 */
export const scaffoldPluginFiles = (
	options: IScaffoldPluginOptions
): readonly IScaffoldedFile[] => {
	const id = kebab(options.pluginName);
	const scope = options.scope ?? '@cartago-git';
	const pkg = `${scope}/mcp-${id}`;
	const fn = pascal(id);
	const safeDescription = options.description.replace(/'/g, '');
	return [
		{
			path: `plugins/${id}/package.json`,
			content: `${JSON.stringify(
				{
					name: pkg,
					version: '0.1.0',
					type: 'module',
					description: safeDescription,
					license: 'MIT',
					main: './src/index.ts',
					exports: { '.': './src/index.ts' },
					peerDependencies: { '@mcp-vertex/core': '^0.1.0' },
					dependencies: {
						'@modelcontextprotocol/sdk': '^1.29.0',
						zod: '^4.4.3',
					},
				},
				null,
				'\t'
			)}\n`,
		},
		{
			path: `plugins/${id}/src/index.ts`,
			content: `import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

/**
 * ${safeDescription}
 *
 * Loaded with \`mcp-core --plugins=${id}\`. Every tool is namespaced by
 * the plugin name and returns structured JSON so any agent or model
 * can consume it deterministically.
 */
export default definePlugin({
	name: '${id}',
	version: '0.1.0',
	describe: '${safeDescription}',
	register(ctx) {
		const prefix = ctx.namespacePrefix; // defaults to '${id}'
		return {
			tools: [
				{
					id: '${id}_ping',
					register: async (server) => {
						server.registerTool(
							\`\${prefix}_ping\`,
							{
								description:
									'Health check for the ${id} plugin; echoes its resolved paths.',
								inputSchema: z.object({}),
							},
							async () => ({
								content: [
									{
										type: 'text' as const,
										text: JSON.stringify(
											{
												plugin: '${id}',
												cacheDir: ctx.pluginCacheDir,
												docsDir: ctx.pluginDocsDir,
												options: ctx.options,
											},
											null,
											'\\t'
										),
									},
								],
							})
						);
					},
				},
			],
			knowledge: [
				{
					id: '${id}-overview',
					title: '${fn} plugin',
					body: '${safeDescription}',
				},
			],
		};
	},
});
`,
		},
		{
			path: `plugins/${id}/tsconfig.json`,
			content: `${JSON.stringify(
				{
					extends: '../../tsconfig.base.json',
					include: ['src/**/*', 'tests/**/*'],
				},
				null,
				'\t'
			)}\n`,
		},
		{
			path: `plugins/${id}/README.md`,
			content: `# ${pkg}

${safeDescription}

## Use

\`\`\`jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-core": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=${id}"]
		}
	}
}
\`\`\`

See \`PLUGINS-MCP-CORE.md\` at the docs folder for the full plugin guide.
`,
		},
	];
};

// ---------------------------------------------------------------------------
// MCP client generator — "tools to create clients"
// ---------------------------------------------------------------------------

export interface IScaffoldClientOptions {
	/** Client id, e.g. `acme`. */
	readonly clientName: string;
	/** One-line description of the client. */
	readonly description: string;
	/** npm scope (default `@cartago-git`). */
	readonly scope?: string;
	/** Command the client spawns to reach the server (default `bunx`). */
	readonly serverCommand?: string;
	/** Args for that command (default loads mcp-core with no plugins). */
	readonly serverArgs?: readonly string[];
}

/**
 * Generate a reusable MCP **client** library: it connects (stdio) to an
 * MCP server and exposes its tools as typed functions, so other
 * libraries — and the agents that use them — can consume that server
 * programmatically. This is the counterpart of the host/server
 * scaffolds: build servers with `kind:host`, build consumers with
 * `kind:client`.
 */
export const scaffoldClientFiles = (
	options: IScaffoldClientOptions
): readonly IScaffoldedFile[] => {
	const id = kebab(options.clientName);
	const scope = options.scope ?? '@cartago-git';
	const pkg = `${scope}/mcp-client-${id}`;
	const fn = pascal(id);
	const safeDescription = options.description.replace(/'/g, '');
	const command = options.serverCommand ?? 'bunx';
	const args = options.serverArgs ?? ['@mcp-vertex/core'];
	return [
		{
			path: `clients/${id}/package.json`,
			content: `${JSON.stringify(
				{
					name: pkg,
					version: '0.1.0',
					type: 'module',
					description: safeDescription,
					license: 'MIT',
					main: './src/index.ts',
					exports: { '.': './src/index.ts' },
					dependencies: { '@modelcontextprotocol/sdk': '^1.29.0' },
				},
				null,
				'\t'
			)}\n`,
		},
		{
			path: `clients/${id}/src/index.ts`,
			content: `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * ${safeDescription}
 *
 * A thin, reusable wrapper around an MCP server: connect, discover and
 * call its tools as plain async functions. Other libraries and agents
 * import this instead of speaking MCP directly.
 */
export interface I${fn}ClientOptions {
	/** Command to launch the server (default '${command}'). */
	readonly command?: string;
	/** Args for that command. */
	readonly args?: readonly string[];
}

export interface I${fn}Client {
	readonly raw: Client;
	listTools(): Promise<unknown>;
	callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
	close(): Promise<void>;
}

export const create${fn}Client = async (
	options: I${fn}ClientOptions = {}
): Promise<I${fn}Client> => {
	const transport = new StdioClientTransport({
		command: options.command ?? '${command}',
		args: [...(options.args ?? ${JSON.stringify(args)})],
	});
	const client = new Client(
		{ name: '${id}-client', version: '0.1.0' },
		{ capabilities: {} }
	);
	await client.connect(transport);
	return {
		raw: client,
		listTools: () => client.listTools(),
		callTool: (name, args = {}) =>
			client.callTool({ name, arguments: args }),
		close: () => client.close(),
	};
};
`,
		},
		{
			path: `clients/${id}/tsconfig.json`,
			content: `${JSON.stringify(
				{
					extends: '../../tsconfig.base.json',
					include: ['src/**/*'],
				},
				null,
				'\t'
			)}\n`,
		},
		{
			path: `clients/${id}/README.md`,
			content: `# ${pkg}

${safeDescription}

\`\`\`ts
import { create${fn}Client } from '${pkg}';

const mcp = await create${fn}Client();
const tools = await mcp.listTools();
const result = await mcp.callTool('mcpcore_overview');
await mcp.close();
\`\`\`
`,
		},
	];
};
