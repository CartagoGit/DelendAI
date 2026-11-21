/**
 * provider-invoke-schema.constant.ts — how the orchestrator reaches a
 * provider.
 *
 * The invoke shape is a discriminated union on `kind`, so a config
 * cannot mix an api `url` with a cli `command`. It was declared inside
 * the roster-entry schema, which made that file grow past the point
 * where a reader could hold it in their head: the union is its own
 * vocabulary — six transports, each with its own fields — and it
 * answers a different question ("how is it called?") than the entry
 * it hangs from ("what is it, and what is it good at?").
 *
 * Split out, the two can change on their own terms, and the file that
 * names a provider stays about providers.
 */
import { PROVIDER_API_FAMILY_IDS } from './provider-api-families.constant';
import z from 'zod';

import { documentedEnum } from '../../plugins/config-schema-docs';
import {
	INVOKE_API_FAMILY_DOCS,
	INVOKE_API_METHOD_DOCS,
} from './config-schema-docs.constant';

export const PROVIDER_INVOKE_SCHEMA = z
	.discriminatedUnion('kind', [
		z
			.object({
				kind: z
					.literal('api')
					.describe(
						'The provider is reached over a hosted HTTP API. The credential is an API key the project holds.',
					),
				url: z
					.string()
					.describe(
						'The API base URL of this provider (e.g. "https://api.openai.com/v1"). Take it from the provider\'s catalogue entry; the request is built on top of it.',
					),
				method: documentedEnum(['GET', 'POST'], INVOKE_API_METHOD_DOCS)
					.optional()
					.describe(
						'The HTTP method the request is made with. Leave it out for the usual POST that carries the prompt.',
					),
				family: documentedEnum(
					PROVIDER_API_FAMILY_IDS,
					INVOKE_API_FAMILY_DOCS,
				)
					.optional()
					.describe(
						'The API family the model catalogue names for this provider; url is then its base URL.',
					),
				envVar: z
					.string()
					.describe(
						'NAME of the environment variable holding the API key (e.g. "OPENAI_API_KEY"). Never put a literal secret here — the config file is committed.',
					),
			})
			.strict(),
		z
			.object({
				kind: z
					.literal('subscription')
					.describe(
						"The provider is a subscription login that the vendor's own client already holds. The credential is that session, not a key you paste in.",
					),
				tool: z
					.string()
					.min(1)
					.describe(
						'The client that holds the login (e.g. "claude-code", "codex"). The runner drives that client, so the session is whatever it already has.',
					),
			})
			.strict(),
		z
			.object({
				kind: z
					.literal('cli')
					.describe(
						'The provider is a command line client the runner starts as a child process and then talks to.',
					),
				command: z
					.string()
					.describe(
						'The executable to run (e.g. "claude"). It has to be on the PATH of the machine that does the work.',
					),
				args: z
					.array(
						z
							.string()
							.describe(
								'One argument handed to the command, written exactly as it should reach the client.',
							),
					)
					.optional()
					.describe(
						'The arguments the client is started with, before the prompt is appended.',
					),
				env: z
					.array(
						z
							.string()
							.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
							.describe(
								'NAME of one environment variable this client needs beyond PATH, HOME and locale (e.g. "ANTHROPIC_API_KEY"). The value is never written here — the variable is named, not carried.',
							),
					)
					.optional()
					.describe(
						'The environment variables this client needs. Naming them lets the runner start the client with only those, instead of handing it the whole server environment.',
					),
			})
			.strict(),
		z
			.object({
				kind: z
					.literal('mcp-server')
					.describe(
						'The provider is an MCP server the runner calls as a tool.',
					),
				server: z
					.string()
					.describe(
						'The MCP server to call — the name it is registered under, or the command that starts it.',
					),
				tool: z
					.string()
					.describe(
						'The tool on that server that carries the model (e.g. "run_prompt").',
					),
				args: z
					.record(z.string(), z.unknown())
					.describe(
						"The arguments that tool is called with. Their shape belongs to the tool, so take them from the server's own schema.",
					),
			})
			.strict(),
		z
			.object({
				kind: z
					.literal('acp')
					.describe(
						'The provider is an agent the runner drives over the Agent Client Protocol.',
					),
				agent: z
					.string()
					.min(1)
					.optional()
					.describe(
						'An agent id the ACP registry or a declaration names.',
					),
				command: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The command that starts the agent, for one the registry does not already know.',
					),
				args: z
					.array(
						z
							.string()
							.describe(
								'One argument handed to the command, written exactly as it should reach the agent.',
							),
					)
					.optional()
					.describe(
						'The arguments the agent is started with, before anything else is asked of it.',
					),
			})
			.strict()
			.refine(
				(invoke) =>
					invoke.agent !== undefined || invoke.command !== undefined,
				{
					message: 'an acp invoke names an agent or a command',
				},
			),
		z
			.object({
				kind: z
					.literal('host-sampling')
					.describe(
						'The provider is a model the host editor runs itself, reached through MCP sampling. The key stays with the host and never reaches delendai.',
					),
				model: z
					.string()
					.min(1)
					.describe(
						'The model the host editor is asked to run (MCP sampling), as the host names it; its key stays with the host.',
					),
			})
			.strict(),
	])
	.describe(
		'How the runner reaches this provider. The `kind` picks the transport and decides which fields are legal: a hosted API is called with a URL, a CLI is started as a command, a subscription client is driven as it already is.',
	);
