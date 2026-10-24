/**
 * declared-agent-schema.constant.ts — `agents[]` in delendai.config.json or
 * a person's own file: an agent the catalogues miss, or one to reach in
 * another way than the registry says.
 *
 * An ACP agent is declared in the registry's own shape (`distribution`) or
 * by the command that starts it. Any other agent declares its kind and
 * what reaches it, plus the command lines that answer its probes. No
 * value of a credential belongs here: a key is named by its variable.
 */
import { z } from 'zod';

const KEBAB_ID = /^[a-z0-9][a-z0-9-]*$/u;

const PACKAGE_LAUNCH = z
	.object({
		package: z.string().min(1),
		args: z.array(z.string()).optional(),
	})
	.strict();

const BINARY_LAUNCH = z
	.object({
		archive: z.string().url(),
		cmd: z.string().min(1),
		args: z.array(z.string()).optional(),
		sha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u)
			.optional(),
	})
	.strict();

export const DECLARED_AGENT_KINDS = [
	'acp',
	'cli',
	'exec',
	'http',
	'file',
	'mcp',
] as const;

export const DECLARED_AGENT_SCHEMA = z
	.object({
		id: z
			.string()
			.regex(KEBAB_ID)
			.describe('Kebab-case id; a registry id overrides that entry.'),
		name: z.string().min(1).optional(),
		kind: z.enum(DECLARED_AGENT_KINDS).describe('How it is reached.'),
		command: z
			.string()
			.min(1)
			.optional()
			.describe('The command that starts it (acp, cli).'),
		args: z.array(z.string()).optional(),
		path: z
			.string()
			.min(1)
			.optional()
			.describe('An executable or script (exec), or a file (file).'),
		url: z.string().url().optional().describe('Where it answers (http).'),
		mcpServer: z
			.string()
			.min(1)
			.optional()
			.describe('The MCP server that serves it (mcp).'),
		distribution: z
			.object({
				npx: PACKAGE_LAUNCH.optional(),
				uvx: PACKAGE_LAUNCH.optional(),
				binary: z.record(z.string(), BINARY_LAUNCH).optional(),
			})
			.strict()
			.optional()
			.describe('As the ACP registry gives it (acp).'),
		keyVariables: z
			.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u))
			.optional(),
		probes: z
			.object({
				login: z.string().min(1).optional(),
				models: z.string().min(1).optional(),
				prompt: z.string().min(1).optional(),
				quota: z.string().min(1).optional(),
			})
			.strict()
			.optional()
			.describe('Command lines that answer each probe (cli, exec).'),
	})
	.strict()
	.superRefine((agent, ctx) => {
		const reach: Record<(typeof DECLARED_AGENT_KINDS)[number], boolean> = {
			acp:
				agent.command !== undefined || agent.distribution !== undefined,
			cli: agent.command !== undefined,
			exec: agent.path !== undefined || agent.command !== undefined,
			http: agent.url !== undefined,
			file: agent.path !== undefined,
			mcp: agent.mcpServer !== undefined,
		};
		if (!reach[agent.kind])
			ctx.addIssue({
				code: 'custom',
				path: ['kind'],
				message: `a ${agent.kind} agent needs what reaches it`,
			});
	});
