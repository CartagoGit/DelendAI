// host scaffolding kit: "tools to create tools". A project that
// imports delendai calls these generators (directly or through the
// `<prefix>_scaffold` MCP tool) to create its OWN MCP server,
// orchestrator and subagent adapters, instructions file, tools,
// prompts and skills — all templated so every agent DELEGATES to the
// project's own MCP server (`<prefix>_overview` first — the universal
// delendai entry point), never to a hardcoded host. Templates only name
// tools that exist: `overview` (always, via the delendai CLI) and the
// generated scaffold tool; proposal-workflow tools are shown as
// conditional on loading the `proposals` plugin.

import { toKebabCase } from '../shared/string-normalize';

export interface IScaffoldedFile {
	readonly path: string;
	readonly content: string;
}

export interface IScaffoldHostOptions {
	/** Project display name, e.g. `Acme Quest`. */
	readonly projectName: string;
	/** Tool namespace, e.g. `acme` → `acme_*` tools. */
	readonly namespacePrefix: string;
	/** Package that will hold the host server, e.g. `@acme/mcp-project`. */
	readonly projectPackageName: string;
	/** Workspace-relative package/root that receives generated host sources. */
	readonly targetDir?: string;
	/** Default agent model id. */
	readonly defaultModel?: string;
	/**
	 * x00183 (F6): Claude Code's recognised `model:` aliases (e.g.
	 * `sonnet`, `opus`) — provider-specific, so core never bakes them in.
	 * Hosts that want the Claude subagent file's `model:` field
	 * short-circuited for a bare alias (not just a `claude-…` id) pass
	 * their alias list here. Default empty: an alias-less `defaultModel`
	 * only resolves through the generic `claude-` prefix check.
	 */
	readonly claudeModelAliases?: readonly string[];
	/**
	 * Namespaced ids of the bootstrap tools that the generated host should
	 * reference from its agent/instructions files. Defaults to
	 * `[\`<prefix>_analyze_project\`, \`<prefix>_plan_mcp_project\`,
	 * \`<prefix>_create_project\`]`. Hosts that add a `drift_check` tool
	 * should append it here so the orchestrator knows it exists.
	 */
	readonly bootstrapToolIds?: readonly string[];
	/**
	 * When true, the scaffolder skips emitting `libs/mcp-project/`
	 * (host-config, server entry, `.vscode/mcp.json`) because the
	 * project already wires delendai via its own `delendai.config.json`
	 * + `plugins/` layout. Agents / instructions / skill are still
	 * emitted so the host-instruction contract is honoured on every
	 * supported editor (Copilot Chat, Claude Code, Codex CLI).
	 *
	 * Defaults to `false` so greenfield projects still get the
	 * `libs/mcp-project/` bootstrap.
	 */
	readonly existingDelendai?: boolean;
	/**
	 * The MCP server's actual registration key in the editor config
	 * (`.vscode/mcp.json`'s `servers.<key>`, `.mcp.json`'s
	 * `mcpServers.<key>`). Copilot's `.agent.md` `tools:` grant and
	 * instructions file reference this key to qualify tool names
	 * (`<key>/<prefix>_overview`); every other generated surface calls
	 * tools unqualified and does not need it.
	 *
	 * Defaults to `mcp-project-${namespacePrefix}` — the key
	 * `scaffoldServerEntryFiles` registers for a fresh greenfield
	 * project, so omitting this option reproduces today's output
	 * exactly. A project adopting delendai as a guest
	 * (`existingDelendai: true`) already has its OWN server key (e.g.
	 * `delendai`, or whatever its `.vscode/mcp.json` already names) —
	 * pass it here so generated agents reference a server that actually
	 * exists instead of the greenfield default, which does not.
	 */
	readonly mcpServerName?: string;
}

export interface IScaffoldNamespaceContract {
	readonly namespacePrefix: string;
	readonly mcpServerName?: string;
}

export const defaultMcpServerName = (namespacePrefix: string): string =>
	`mcp-project-${namespacePrefix}`;

export const resolveScaffoldMcpServerName = (
	options: IScaffoldNamespaceContract,
): string =>
	options.mcpServerName ?? defaultMcpServerName(options.namespacePrefix);

/**
 * The MCP server registration key generated Copilot surfaces (the
 * `.agent.md` `tools:` grant, the instructions file) reference to
 * qualify tool names. See `IScaffoldHostOptions.mcpServerName`.
 */
const resolveMcpServerName = (options: IScaffoldHostOptions): string =>
	resolveScaffoldMcpServerName(options);

const SUBAGENT_SLOTS = [
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

export type IScaffoldAgentSlot =
	| 'orchestrator'
	| (typeof SUBAGENT_SLOTS)[number];

const kebab = (value: string): string => toKebabCase(value);

const pascal = (value: string): string =>
	kebab(value)
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');

const normalizeTargetDir = (value: string | undefined): string => {
	const normalized = (value ?? 'libs/mcp-project')
		.replaceAll('\\', '/')
		.replace(/^\.\//, '')
		.replace(/\/+$/, '');
	return normalized === '' ? '.' : normalized;
};

const targetPath = (targetDir: string | undefined, path: string): string => {
	const root = normalizeTargetDir(targetDir);
	return root === '.' ? path : `${root}/${path}`;
};

// ---------------------------------------------------------------------------
// Single-artefact generators
// ---------------------------------------------------------------------------

export const scaffoldToolFile = (
	prefix: string,
	name: string,
	description: string,
	targetDir?: string,
): IScaffoldedFile => {
	const id = kebab(name);
	const fn = pascal(name);
	const toolName = `${prefix}_${id.replace(/-/g, '_')}`;
	const toolSymbol = toolName.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
	return {
		path: targetPath(targetDir, `src/lib/tools/${prefix}-${id}.tool.ts`),
		content: `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

export const ${toolSymbol}_TOOL = {
	name: '${toolName}',
	description: '${description.replace(/'/g, '')}',
} as const;

export const ${toolSymbol}_INPUT_SCHEMA = z.object({});

export const ${toolSymbol}_OUTPUT_SCHEMA = z.object({
	content: z.array(
		z.object({
			type: z.literal('text'),
			text: z.string(),
		}),
	),
});

export type I${fn}Args = z.infer<typeof ${toolSymbol}_INPUT_SCHEMA>;

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
		${toolSymbol}_TOOL.name,
		{
			description: ${toolSymbol}_TOOL.description,
			inputSchema: ${toolSymbol}_INPUT_SCHEMA,
			outputSchema: ${toolSymbol}_OUTPUT_SCHEMA,
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
	description: string,
	body?: string,
	targetDir?: string,
): IScaffoldedFile => {
	const id = kebab(name);
	const fn = pascal(name);
	const promptName = `${prefix}-${id}`;
	const promptSymbol = `${prefix}_${id}`
		.replace(/[^a-z0-9]+/gi, '_')
		.toUpperCase();
	const safeDescription = description.replace(/'/g, '');
	const safeBody = (body ?? '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
	const userText =
		body !== undefined && body.length > 0
			? safeBody
			: `Wrapper: call the ${prefix} MCP tools; the server is the source of truth.`;
	return {
		path: targetPath(
			targetDir,
			`src/lib/prompts/${prefix}-${id}.prompt.ts`,
		),
		content: `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const ${promptSymbol}_PROMPT = {
	name: '${promptName}',
	description: '${safeDescription}',
} as const;

export async function register${fn}Prompt(server: McpServer): Promise<void> {
	server.registerPrompt(
		'${promptName}',
		{ description: '${safeDescription}' },
		async () => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: \`${userText}\`,
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
	whenToUse: readonly string[] = [],
	body?: string,
	targetDir?: string,
): IScaffoldedFile => {
	const id = kebab(name);
	const bullets =
		whenToUse.length > 0
			? whenToUse.map((entry) => `- ${entry}`).join('\n')
			: `- Before working on ${name} in this project.`;
	const bodySection =
		body !== undefined && body.length > 0
			? body
			: `- \`${prefix}_overview\` is the source of truth; this skill records the project-specific conventions for ${name}.`;
	return {
		path: targetPath(targetDir, `src/lib/skills/${prefix}-${id}.md`),
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
${bodySection}

## Checklist

- [ ] \`${prefix}_overview\` is the first call of the session.
`,
	};
};

export const scaffoldAgentFile = (
	options: IScaffoldHostOptions,
	slot: IScaffoldAgentSlot,
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	const model = options.defaultModel ?? '<your-model>';
	const isRoot = slot === 'orchestrator';
	const serverName = resolveMcpServerName(options);
	const tools = isRoot
		? `[read, search, edit, execute, todo, agent, ${serverName}/*]`
		: `[read, search, edit, execute, todo, ${serverName}/*]`;
	const bootstrapTools = (
		options.bootstrapToolIds ?? [
			`${prefix}_analyze_project`,
			`${prefix}_plan_mcp_project`,
			`${prefix}_create_project`,
		]
	)
		.map((id) => `\`${id}\``)
		.join(', ');
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

This file is only the Copilot adapter; the agent contract lives in \`${serverName}\`.

## Compact lane

1. First call \`${prefix}_overview\` once per turn (tool: \`${serverName}/${prefix}_overview\`); it maps the server's tools/plugins and returns a \`recommendedNextAction\` — follow it. Only call tools that \`overview\` lists.
2. Keep the main thread as the coordinator: \`${prefix}_auto_work\` → maybe \`${prefix}_continue_proposal { mode: "plan" }\` → maybe \`${prefix}_delegate\`. If a slice needs more than 3 tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the heavy inspection here.
3. One atomic slice per turn; minimal validation; trust the MCP payload over local re-derivation.
4. When the server loads the \`proposals\` plugin (\`delendai --plugins=proposals\`), claim files before writing with \`${prefix}_agent_lock\` and report \`lock-conflict\` instead of retrying; otherwise work with whatever tools \`overview\` reports.
5. A broken global gate outside your ownership is \`external-gate-blocker\`: record evidence and continue with owned work.
6. When the project changes shape (new script, new framework, new monorepo package, dropped dependency), the host owns re-analysis: ${isRoot ? '' : 'escalate to the root so '}the orchestrator can call ${bootstrapTools}. The first tool inspects; the second returns an exhaustive blueprint (tools + prompts + skills + agents + tests); the third materialises the files. The orchestrator (or a delegated runner) writes them.
`,
	};
};

const claudeModelField = (
	defaultModel: string | undefined,
	claudeModelAliases: readonly string[] = [],
): string => {
	if (defaultModel === undefined) return '';
	if (
		claudeModelAliases.includes(defaultModel) ||
		defaultModel.startsWith('claude-')
	) {
		return `\nmodel: ${defaultModel}`;
	}
	return '';
};

/**
 * x00160 S1 — Claude Code's own subagent format
 * (`.claude/agents/<name>.md`), generated alongside the Copilot
 * `.agent.md` variant above. AGENT-BOOTSTRAP.md §8.2 unconditionally
 * tells every Claude Code host to delegate to the orchestrator
 * subagent; without this file nothing ever creates it.
 *
 * Schema verified against Claude Code's documented subagent contract
 * (code.claude.com/docs/en/sub-agents): required `name` (kebab-case)
 * + `description`; optional `tools` (a COMMA-SEPARATED STRING, not a
 * YAML list) and `model`. `tools` is deliberately omitted here — the
 * Copilot variant's tool vocabulary (`read`, `search`, `edit`,
 * `mcp-project-<prefix>/*`, …) does not map to Claude Code's own tool
 * names, and inventing an unverified mapping would trade one
 * inaccuracy for another; omitting `tools` inherits every tool
 * available to subagents in the session, which is the closest honest
 * equivalent to the Copilot file's broad `[read, search, edit,
 * execute, todo, agent, …]` grant.
 */
export const scaffoldClaudeAgentFile = (
	options: IScaffoldHostOptions,
	slot: IScaffoldAgentSlot,
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	const isRoot = slot === 'orchestrator';
	const name = kebab(slot);
	const modelField = claudeModelField(
		options.defaultModel,
		options.claudeModelAliases,
	);
	return {
		path: `.claude/agents/${name}.md`,
		content: `---
name: ${name}
description: ${isRoot ? 'Root orchestrator' : 'Bounded subagent'} for ${options.projectName}. The real contract lives in the ${prefix} MCP server — use for any non-trivial change (more than 3 tool calls, multiple files, or repeated MCP reads).${modelField}
---

# ${pascal(slot)} (${options.projectName})

The agent contract lives in the \`${prefix}\` MCP server, not in this file.

## Compact lane

1. First call \`${prefix}_overview\` once per turn; it maps the server's tools/plugins and returns a \`recommendedNextAction\` — follow it. Only call tools that \`overview\` lists.
2. Keep the main thread as the coordinator: \`${prefix}_auto_work\` → maybe \`${prefix}_continue_proposal { mode: "plan" }\` → maybe \`${prefix}_delegate\`. If a slice needs more than 3 tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the heavy inspection here.
3. One atomic slice per turn; minimal validation; trust the MCP payload over local re-derivation.
4. When the server loads the \`proposals\` plugin, claim files before writing with \`${prefix}_agent_lock\` and report \`lock-conflict\` instead of retrying; otherwise work with whatever tools \`overview\` reports.
5. A broken global gate outside your ownership is \`external-gate-blocker\`: record evidence and continue with owned work.
6. When the project changes shape (new script, new framework, new monorepo package, dropped dependency), the host owns re-analysis${isRoot ? '' : ': escalate to the root so'} the orchestrator can call \`${prefix}_analyze_project\`, \`${prefix}_plan_mcp_project\`, \`${prefix}_create_project\`. The first tool inspects; the second returns an exhaustive blueprint; the third materialises the files.
`,
	};
};

/**
 * Codex CLI custom-subagent format
 * (`.codex/agents/<name>.md`), generated alongside the Copilot and
 * Claude variants. Codex CLI treats a subagent file as a named,
 * invocable prompt template — `name` (kebab-case) + `description` are
 * the only required keys; everything else is host-managed.
 *
 * The generated description mirrors `scaffoldClaudeAgentFile`: the
 * contract lives in the `${prefix}` MCP server, not in the file
 * itself. We deliberately do NOT emit a `tools:` field here — Codex
 * CLI's documented custom-agent format does not constrain it, and
 * copying the Copilot variant's vocabulary (`mcp-project-<prefix>/*`,
 * …) would be just as inaccurate as it is for Claude. Omitting the
 * field inherits the tools available to the session.
 *
 * AGENT-BOOTSTRAP.md §8.3 is the host appendix that tells Codex
 * sessions how to use this file. Without it the Codex CLI host reads
 * only `AGENTS.md` (which is shared with Copilot Chat) and never
 * knows the subagent exists.
 */
export const scaffoldCodexAgentFile = (
	options: IScaffoldHostOptions,
	slot: IScaffoldAgentSlot,
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	const isRoot = slot === 'orchestrator';
	const name = kebab(slot);
	return {
		path: `.codex/agents/${name}.md`,
		content: `---
name: ${name}
description: ${isRoot ? 'Root orchestrator' : 'Bounded subagent'} for ${options.projectName}. The real contract lives in the ${prefix} MCP server — use for any non-trivial change (more than 3 tool calls, multiple files, or repeated MCP reads).
---

# ${pascal(slot)} (${options.projectName})

The agent contract lives in the \`${prefix}\` MCP server, not in this file.

## Compact lane

1. First call \`${prefix}_overview\` once per turn; it maps the server's tools/plugins and returns a \`recommendedNextAction\` — follow it. Only call tools that \`overview\` lists.
2. Keep the main thread as the coordinator: \`${prefix}_auto_work\` → maybe \`${prefix}_continue_proposal { mode: "plan" }\` → maybe \`${prefix}_delegate\`. If a slice needs more than 3 tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the heavy inspection here.
3. One atomic slice per turn; minimal validation; trust the MCP payload over local re-derivation.
4. When the server loads the \`proposals\` plugin, claim files before writing with \`${prefix}_agent_lock\` and report \`lock-conflict\` instead of retrying; otherwise work with whatever tools \`overview\` reports.
5. A broken global gate outside your ownership is \`external-gate-blocker\`: record evidence and continue with owned work.
6. When the project changes shape (new script, new framework, new monorepo package, dropped dependency), the host owns re-analysis${isRoot ? '' : ': escalate to the root so'} the orchestrator can call \`${prefix}_analyze_project\`, \`${prefix}_plan_mcp_project\`, \`${prefix}_create_project\`. The first tool inspects; the second returns an exhaustive blueprint; the third materialises the files.
`,
	};
};

export const scaffoldInstructionsFile = (
	options: IScaffoldHostOptions,
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	const serverName = resolveMcpServerName(options);
	return {
		path: '.github/copilot-instructions.md',
		content: `# Copilot Instructions - ${options.projectName}

## Source of truth

The MCP server \`${serverName}\` rules. Do NOT re-derive workflow from docs:

- Entry point: \`${prefix}_overview\` (ALWAYS the first call) — it lists the server's tools, plugins and a \`recommendedNextAction\`.
- The multi-agent proposal workflow (\`${prefix}_auto_work\`, \`${prefix}_continue_proposal\`, \`${prefix}_delegate\`, \`${prefix}_agent_lock\`, quality gates via \`${prefix}_get_validation_matrix\`) is available when the server loads the \`proposals\` plugin (\`delendai --plugins=proposals\`).

## Lane

- Default model: \`${options.defaultModel ?? '<your-model>'}\`.
- MCP payload first, one atomic slice, minimal validation, serial continuity.
- Orchestration threshold: keep the root chat to coordination calls. Delegate any slice that needs more than 3 tool calls, multiple files, or repeated MCP reads.
- Every final message ends with ONE close marker line (see the close-markers constant of this host).
`,
	};
};

export const scaffoldHostConfigFile = (
	options: IScaffoldHostOptions,
): IScaffoldedFile => {
	const prefix = options.namespacePrefix;
	return {
		path: targetPath(options.targetDir, 'src/lib/shared/host-config.ts'),
		content: `import {
	buildStandaloneCoreToolRegistrations,
	createWorkspacePathProvider,
} from '@delendai/core/public';
import type { IDelendaiHostConfig } from '@delendai/core/public';

// The core is project-agnostic. The standalone surface registers the
// orientation + bootstrap tools the generated agents rely on
// (overview, analyze/plan/create/drift, scaffold). Domain behaviour —
// including the multi-agent proposal workflow — comes from plugins via
// the delendai CLI (\`delendai --plugins=proposals\`) rather than
// being wired here; see the package README for both launch paths.
// Hermetic: the workspace root is injected by the caller (the server
// entry point), never guessed from the current working directory here —
// a lib must not guess where the project lives, so this stays correct
// under CI, containers and tests.
export const buildHostConfig = (workspaceRoot: string): IDelendaiHostConfig => {
	const workspace = createWorkspacePathProvider(workspaceRoot);
	return {
		metadata: {
			name: 'mcp-project-${prefix}',
			version: '0.0.1',
			description: '${options.projectName} workspace MCP server (built on delendai).',
		},
		namespacePrefix: '${prefix}',
		workspace,
		keepLegacy: false,
		validationMatrix: { scopes: {} },
		extraTools: [
			// Orientation + bootstrap the generated agents/instructions
			// promise. Add project tools after this spread.
			...buildStandaloneCoreToolRegistrations({
				namespacePrefix: '${prefix}',
				workspace,
				projectName: '${options.projectName}',
				projectPackageName: '${options.projectPackageName}',
				keepLegacy: false,
			}),
		],
	};
};
`,
	};
};

export const scaffoldServerEntryFiles = (
	options: IScaffoldHostOptions,
): readonly IScaffoldedFile[] => [
	{
		path: targetPath(options.targetDir, 'src/server.ts'),
		content: `import { createMcpProject } from '@delendai/core/public';

import { buildHostConfig } from './lib/shared/host-config';

// The entry point is the ONE place allowed to read the launch directory
// (like delendai's own CLI). It resolves the workspace root and injects
// it into the (hermetic) host config.
export async function startServer(workspaceRoot = process.cwd()): Promise<void> {
	const assembled = await createMcpProject(buildHostConfig(workspaceRoot));
	await assembled.start();
}
`,
	},
	{
		path: targetPath(options.targetDir, 'src/index.ts'),
		content: `import { startServer } from './server';

void startServer();
`,
	},
	{
		path: '.vscode/mcp.json',
		content: `${JSON.stringify(
			{
				servers: {
					[resolveMcpServerName(options)]: {
						command: 'bun',
						args: ['--watch', 'run', 'src/index.ts'],
						cwd:
							normalizeTargetDir(options.targetDir) === '.'
								? '${workspaceFolder}'
								: `\${workspaceFolder}/${normalizeTargetDir(options.targetDir)}`,
					},
				},
			},
			null,
			'\t',
		)}
`,
	},
];

/**
 * The greenfield host package files: a self-contained `package.json`,
 * `tsconfig.json` and `README.md` under `targetDir` so the generated
 * host is runnable out of the box in a repo that has none of its own
 * (the same self-contained stance as `scaffoldPluginFiles` — a00067:
 * no dependency on a root `tsconfig.base.json` or `vitest.shared`).
 */
export const scaffoldHostPackageFiles = (
	options: IScaffoldHostOptions,
): readonly IScaffoldedFile[] => {
	const { projectPackageName, projectName, namespacePrefix } = options;
	const prefix = namespacePrefix;
	return [
		{
			path: targetPath(options.targetDir, 'package.json'),
			content: `${JSON.stringify(
				{
					name: projectPackageName,
					version: '0.0.1',
					private: true,
					type: 'module',
					description: `${projectName} workspace MCP server (built on delendai).`,
					scripts: {
						dev: 'bun --watch run src/index.ts',
						typecheck: 'tsc --noEmit -p tsconfig.json',
					},
					dependencies: {
						'@delendai/core': '^0.1.0',
						'@modelcontextprotocol/sdk': '^1.29.0',
						zod: '^4.4.3',
					},
					devDependencies: {
						'@types/node': '^26.1.0',
						typescript: '^7.0.0',
					},
				},
				null,
				'\t',
			)}\n`,
		},
		{
			path: targetPath(options.targetDir, 'tsconfig.json'),
			content: `${JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'bundler',
						lib: ['ES2022'],
						strict: true,
						esModuleInterop: true,
						skipLibCheck: true,
						resolveJsonModule: true,
						noEmit: true,
					},
					include: ['src/**/*'],
				},
				null,
				'\t',
			)}\n`,
		},
		{
			path: targetPath(options.targetDir, 'README.md'),
			content: `# ${projectName} — MCP server (built on delendai)

This host registers the orientation + bootstrap surface (${prefix}_overview,
${prefix}_analyze_project, ${prefix}_plan_mcp_project, ${prefix}_create_project,
${prefix}_drift_check, ${prefix}_scaffold) so any agent can orient itself and
generate project tools.

## Two launch paths

1. **Own server (this package)** — run \`bun install\` then \`bun run dev\`.
   This host is plugin-less: it exposes orientation + bootstrap only.

2. **Full delendai (recommended)** — launch the canonical CLI to load
   plugins (the multi-agent proposal workflow, issues, quality gates, …):

   \`\`\`bash
   bunx --package @delendai/cli delendai __serve --workspace . --preset full
   \`\`\`

   The editor registration in \`.vscode/mcp.json\` is the source of truth for
   which launch the IDE actually uses. See
   \`docs/delendai/CROSS-PROJECT-SETUP.md\` for the full setup guide.
`,
		},
	];
};

/**
 * Codex CLI's native MCP server registration (\`.codex/config.toml\`),
 * mirroring the VS Code \`.vscode/mcp.json\` entry the same host ships.
 */
export const scaffoldCodexConfigFile = (
	options: IScaffoldHostOptions,
): IScaffoldedFile => {
	const targetDir = normalizeTargetDir(options.targetDir);
	return {
		path: '.codex/config.toml',
		content: `# Codex CLI MCP server registration (mirrors .vscode/mcp.json).
[mcp_servers.${resolveMcpServerName(options)}]
command = "bun"
args = ["--watch", "run", "src/index.ts"]
cwd = "${targetDir === '.' ? '.' : targetDir}"
`,
	};
};

/**
 * Everything a brand-new project needs: server entry + host config +
 * editor registration + orchestrator + 4 subagents (in all three
 * host formats: Copilot `.agent.md`, Claude Code `.claude/agents`,
 * Codex CLI `.codex/agents`) + instructions + a starter skill.
 *
 * When `options.existingDelendai === true`, the host server entry
 * files are omitted — the caller has wired the project to delendai
 * via its own `delendai.config.json` + `plugins/` layout and does
 * not want the scaffolder to overwrite that with a fresh
 * `libs/mcp-project/` server. The agents, instructions and skill are
 * still emitted (those are the contract surface any host needs).
 */
export const scaffoldHostProject = (
	options: IScaffoldHostOptions,
): readonly IScaffoldedFile[] => {
	const agentFiles: IScaffoldedFile[] = [
		scaffoldAgentFile(options, 'orchestrator'),
		...SUBAGENT_SLOTS.map((slot) => scaffoldAgentFile(options, slot)),
		scaffoldClaudeAgentFile(options, 'orchestrator'),
		...SUBAGENT_SLOTS.map((slot) => scaffoldClaudeAgentFile(options, slot)),
		scaffoldCodexAgentFile(options, 'orchestrator'),
		...SUBAGENT_SLOTS.map((slot) => scaffoldCodexAgentFile(options, slot)),
	];
	const hostFiles: IScaffoldedFile[] = options.existingDelendai
		? []
		: [
				scaffoldHostConfigFile(options),
				...scaffoldServerEntryFiles(options),
				...scaffoldHostPackageFiles(options),
				scaffoldCodexConfigFile(options),
			];
	return [
		...hostFiles,
		...agentFiles,
		scaffoldInstructionsFile(options),
		scaffoldSkillFile(
			options.namespacePrefix,
			'project-standards',
			`Closed stack and conventions of ${options.projectName}.`,
			[],
			undefined,
			options.targetDir,
		),
	];
};

// ---------------------------------------------------------------------------
// Plugin generator — "delendai knows how to create plugins"
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
 * The result is loadable with `delendai --plugins=<pluginName>` once
 * published or linked. Tools are namespaced by the plugin name and
 * return structured JSON so any agent/model can consume them.
 */
export const scaffoldPluginFiles = (
	options: IScaffoldPluginOptions,
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
					// a00067: ship a runnable typecheck so the emitted
					// tsconfig is usable out of the box (matches the
					// extension-host scaffold; without it the tsconfig has no
					// toolchain to run it).
					scripts: { typecheck: 'tsc --noEmit -p tsconfig.json' },
					peerDependencies: { '@delendai/core': '^0.1.0' },
					dependencies: {
						'@modelcontextprotocol/sdk': '^1.29.0',
						zod: '^4.4.3',
					},
					devDependencies: {
						'@types/node': '^26.1.0',
						typescript: '^7.0.0',
					},
				},
				null,
				'\t',
			)}\n`,
		},
		{
			path: `plugins/${id}/src/index.ts`,
			content: `import { definePlugin } from '@delendai/core/public';
import z from 'zod';

/**
 * ${safeDescription}
 *
 * Loaded with \`delendai --plugins=${id}\`. Every tool is namespaced by
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
								outputSchema: z.object({
									plugin: z.string(),
									cacheDir: z.string(),
									docsDir: z.string(),
									options: z.unknown(),
								}),
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
			// Self-contained (a00067): an adopter runs `create_project` in
			// their OWN repo, which has no `tsconfig.base.json` two levels
			// up — extending it made `tsc` fail with TS5083 on the very
			// first build. These are the standard strict options; the
			// package's own deps (@delendai/core, zod) resolve from
			// node_modules, so no monorepo `paths` are needed.
			content: `${JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'bundler',
						lib: ['ES2022'],
						strict: true,
						esModuleInterop: true,
						skipLibCheck: true,
						resolveJsonModule: true,
						noEmit: true,
					},
					include: ['src/**/*', 'tests/**/*'],
				},
				null,
				'\t',
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
		"delendai": {
			"command": "bunx",
			"args": ["@delendai/core", "--plugins=${id}"]
		}
	}
}
\`\`\`

See \`PLUGINS-DELENDAI.md\` at the docs folder for the full plugin guide.
`,
		},
		// f00120 S1: complete the plugin scaffold with the four files the
		// scaffolder was missing (vitest config + LICENSE + public barrel +
		// a passing sample spec). Each is a small, fixed template; the
		// scaffolder stays pure over its inputs.
		{
			// Self-contained vitest config (a00067/f00120): the emitter used to
			// import `../../vitest.shared`, which only resolves inside a real
			// delendai monorepo. An adopter who runs `create_project` in their
			// own repo has no `vitest.shared` at the root and tsc fails on the
			// very first build. Drop the dependency and emit an inline, runnable
			// vitest config that any project shape can boot. The delendai
			// monorepo can still override `vitest.config.ts` after the wire step
			// if it wants the shared aliases.
			path: `plugins/${id}/vitest.config.ts`,
			content: `import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
	},
});
`,
		},
		{
			path: `plugins/${id}/LICENSE`,
			content: `MIT License

Copyright (c) ${new Date().getUTCFullYear()} ${options.pluginName} authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
		},
		{
			path: `plugins/${id}/src/public/index.ts`,
			content: `/**
 * \`@cartago-git/mcp-${id}/public\` — the plugin's public surface.
 *
 * Re-exports every value the rest of the workspace is allowed to import.
 * Internal helpers stay in \`src/lib/\` and are not re-exported here, so
 * the public contract is what \`delendai.config.json\` consumers see.
 */
export { default } from '../index';
export type { IPluginOptions } from '../contracts/interfaces/plugin-options.interface';
`,
		},
		{
			path: `plugins/${id}/src/contracts/interfaces/plugin-options.interface.ts`,
			content: `/**
 * \`@cartago-git/mcp-${id}\` options schema. Plugins carry a typed
 * \`options\` block that hosts materialise from \`delendai.config.json\`.
 * Empty by default; a plugin with knobs extends this with \`zod\` and
 * surfaces it via \`definePlugin({ options })\`.
 */
export interface IPluginOptions {
	/** Reserved for future use. */
	readonly _placeholder?: never;
}
`,
		},
		{
			path: `plugins/${id}/tests/src/lib/ping.spec.ts`,
			content: `import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

/**
 * \`${id}\` — smoke test for the scaffolded plugin. Verifies that the
 * plugin loads, declares the expected id, and ships a working ping
 * tool. Real plugins replace this with feature specs.
 */
describe(\`${id} plugin (scaffolded smoke)\`, () => {
\tit('declares the canonical plugin id', () => {
\t\texpect(plugin.name).toBe('${id}');
\t\texpect(plugin.version).toMatch(/^\\d+\\.\\d+\\.\\d+$/u);
\t});

\tit('exposes a \`ping\` tool through the register callback', async () => {
\t\tconst ctx = {
\t\t\tnamespacePrefix: '${id}',
\t\t\tpluginCacheDir: '<cache>',
\t\t\tpluginDocsDir: '<docs>',
\t\t\toptions: {},
\t\t\tlog: { info() {}, warn() {}, error() {}, debug() {} },
\t\t} as const;
\t\tconst registration = await plugin.register(ctx as never);
\t\tconst tools = (registration as { tools: Array<{ id: string }> }).tools;
\t\tconst ping = tools.find((t) => t.id === '${id}_ping');
\t\texpect(ping).toBeDefined();
\t});
});
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
	/** Args for that command (default loads delendai with no plugins). */
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
	options: IScaffoldClientOptions,
): readonly IScaffoldedFile[] => {
	const id = kebab(options.clientName);
	const scope = options.scope ?? '@cartago-git';
	const pkg = `${scope}/mcp-client-${id}`;
	const fn = pascal(id);
	const safeDescription = options.description.replace(/'/g, '');
	const command = options.serverCommand ?? 'bunx';
	const args = options.serverArgs ?? ['@delendai/core'];
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
					// a00067: runnable typecheck for the emitted tsconfig.
					scripts: { typecheck: 'tsc --noEmit -p tsconfig.json' },
					dependencies: { '@modelcontextprotocol/sdk': '^1.29.0' },
					devDependencies: {
						'@types/node': '^26.1.0',
						typescript: '^7.0.0',
					},
				},
				null,
				'\t',
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
			// Self-contained (a00067) — see the plugin scaffold's note: an
			// adopter's repo has no `tsconfig.base.json`, so extending it
			// broke `tsc` on the first build (TS5083).
			content: `${JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'bundler',
						lib: ['ES2022'],
						strict: true,
						esModuleInterop: true,
						skipLibCheck: true,
						resolveJsonModule: true,
						noEmit: true,
					},
					include: ['src/**/*'],
				},
				null,
				'\t',
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
const result = await mcp.callTool('delendai_overview');
await mcp.close();
\`\`\`
`,
		},
	];
};
