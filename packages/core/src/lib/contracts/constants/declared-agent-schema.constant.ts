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

import {
	DECLARED_AGENT_KIND_DOCS,
	documentedEnum,
} from '../../plugins/config-schema-docs';

const KEBAB_ID = /^[a-z0-9][a-z0-9-]*$/u;

const PACKAGE_LAUNCH = z
	.object({
		package: z
			.string()
			.min(1)
			.describe(
				'The package that carries the agent, named the way its ecosystem names it: an npm package for npx, a Python package for uvx. The runner installs it on demand the first time the agent is needed.',
			),
		args: z
			.array(
				z
					.string()
					.describe(
						'One argument, exactly as it is typed after the package.',
					),
			)
			.optional()
			.describe(
				'The arguments handed to the package executable, in order. Use it for the flags the package needs to start in the right mode; leave it out when its default start is what you want.',
			),
	})
	.strict();

const BINARY_LAUNCH = z
	.object({
		archive: z
			.string()
			.url()
			.describe(
				'The absolute URL of the archive to download. The runner fetches it, unpacks it and keeps the result in its cache.',
			),
		cmd: z
			.string()
			.min(1)
			.describe(
				'The executable to run inside the unpacked archive, with its path when it does not sit at the root, for example `bin/agent`. The runner runs this file.',
			),
		args: z
			.array(
				z
					.string()
					.describe(
						'One argument, exactly as it is typed after the command.',
					),
			)
			.optional()
			.describe(
				'The arguments passed to that executable, in order. Use it for the flags the agent needs on every start; leave it out when the executable needs nothing extra.',
			),
		sha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u)
			.optional()
			.describe(
				'The expected SHA-256 checksum of the archive, as 64 hexadecimal characters. The runner refuses a download that does not match it; set it whenever a published checksum exists.',
			),
	})
	.strict()
	.describe(
		'One downloadable build of the agent: the archive to fetch, the command to run inside it, and optionally the arguments and the checksum to check it against.',
	);

export const DECLARED_AGENT_KINDS = [
	'acp',
	'cli',
	'exec',
	'http',
	'file',
	'mcp',
] as const;

/**
 * The shape of the `kind` enum, spelled the way zod types it: a record
 * of the legal values.
 *
 * `documentedEnum` is generic over the tuple of values, while zod types
 * `ZodEnum` over the record those values make up, so the call is pinned
 * to the concrete type here. The runtime object is the same enum with
 * the same values either way; only the description travels with it.
 */
type DeclaredAgentKindEnum = z.ZodEnum<{
	readonly [K in (typeof DECLARED_AGENT_KINDS)[number]]: K;
}>;

export const DECLARED_AGENT_SCHEMA = z
	.object({
		id: z
			.string()
			.regex(KEBAB_ID)
			.describe('Kebab-case id; a registry id overrides that entry.'),
		name: z
			.string()
			.min(1)
			.optional()
			.describe(
				'The name to show for this agent in rosters and reports. Use it when the id is an internal handle and a person should read something friendlier; leave it out to fall back to the id.',
			),
		kind: (
			documentedEnum(
				DECLARED_AGENT_KINDS,
				DECLARED_AGENT_KIND_DOCS,
			) as unknown as DeclaredAgentKindEnum
		).describe('How it is reached.'),
		command: z
			.string()
			.min(1)
			.optional()
			.describe('The command that starts it (acp, cli).'),
		args: z
			.array(
				z
					.string()
					.describe(
						'One argument, exactly as it is typed after the command.',
					),
			)
			.optional()
			.describe(
				'The arguments passed to the command, in the order the command expects them: the same words you would type after the command name. Use it for flags that must always be there, such as a model or a profile; leave it out when the command needs nothing extra.',
			),
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
				npx: PACKAGE_LAUNCH.optional().describe(
					'How to start an ACP agent published as an npm package: the package name and the arguments to run it with. Use it when the agent catalogue entry describes an npm release rather than a command that is already installed.',
				),
				uvx: PACKAGE_LAUNCH.optional().describe(
					'How to start an ACP agent published as a Python package: the package name and the arguments to run it with. Use it when the agent catalogue entry describes a Python release rather than a command that is already installed.',
				),
				binary: z
					.record(z.string(), BINARY_LAUNCH)
					.optional()
					.describe(
						'How to start an ACP agent published as a downloadable build: a map from platform to the archive and the command inside it. Use it when the agent ships binaries rather than a package the runner can install.',
					),
			})
			.strict()
			.optional()
			.describe('As the ACP registry gives it (acp).'),
		keyVariables: z
			.array(
				z
					.string()
					.regex(/^[A-Z][A-Z0-9_]*$/u)
					.describe(
						'The name of one environment variable, in capitals, for example `ANTHROPIC_API_KEY`. The value itself is never stored in this file.',
					),
			)
			.optional()
			.describe(
				'The environment variables that hold the credentials of this agent, named by variable and never by value. Use it when the agent needs a key present in its environment; the secrets stay outside this file.',
			),
		probes: z
			.object({
				login: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The command that tells whether the agent is logged in. The runner runs it and reads the exit code, where zero means logged in. Use it when the agent keeps a session rather than a key, and leave it out when there is nothing to check.',
					),
				models: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The command that lists the models the agent offers. The runner runs it and reads the model names from its output. Use it so the models of the agent reach the pickers and the reports without being written down by hand.',
					),
				prompt: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The command that sends a test prompt to the agent and returns its answer. The runner uses it to check that the agent really answers, not merely that it starts. Use it when a clean start is not proof enough.',
					),
				quota: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The command that reports what is left of the allowance of the agent for the current period. The runner uses it to warn before the agent is cut off; leave it out when the provider publishes no quota.',
					),
			})
			.strict()
			.optional()
			.describe('Command lines that answer each probe (cli, exec).'),
	})
	.strict()
	.describe(
		'An agent the catalogues do not know about, or one to reach in a way its catalogue entry does not describe. Give it an id, say how it is reached, and, for a command line agent, the commands that answer its probes.',
	)
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
