/**
 * provider-entry-schema.constant.ts — the one schema of a provider roster entry
 * and of the account it runs on.
 *
 * The root `providers` and `accounts` blocks, the `--check` diagnostic
 * and the orchestrator-runner's own roster option all validate with these,
 * so a roster is portable between them and none of them drifts.
 */
import { PROVIDER_API_FAMILY_IDS } from './provider-api-families.constant';
import z from 'zod';
/**
 * `config-schema-docs.ts` and `declared-agent-schema.constant.ts` import
 * each other, so whichever of the two a consumer reaches first decides
 * whether `documentedEnum` is bound yet. Reaching the agent schema first
 * settles that cycle in the order that works, whatever module a consumer
 * happens to load first.
 */
import {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from './provider-account-modes.constant';
import { CAPABILITY_TAGS } from '../interfaces/provider-capabilities.interface';
import {
	BILLING_MODE_DOCS,
	BUDGET_WINDOW_DOCS,
	CAPABILITY_TAG_DOCS,
	CREDENTIAL_MODE_DOCS,
	documentedEnum,
	INVOKE_API_FAMILY_DOCS,
	INVOKE_API_METHOD_DOCS,
	PROVIDER_KIND_DOCS,
} from '../../plugins/config-schema-docs';

/** Kebab-case id: `claude-sonnet`, `gpt-5-codex`, `claude-work`, … */
const KEBAB_ID_PATTERN = /^[a-z][a-z0-9-]+$/;

/** Name of an environment variable — never its value. */
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/**
 * The capability vocabulary as a non-empty tuple. `documentedEnum` keys
 * its doc map by the values, so the values have to be one — the
 * vocabulary itself stays the single source of truth.
 */
const CAPABILITY_TAG_VALUES = CAPABILITY_TAGS as readonly [
	(typeof CAPABILITY_TAGS)[number],
	...(typeof CAPABILITY_TAGS)[number][],
];

export const CAPABILITY_TAG_SCHEMA = documentedEnum(
	CAPABILITY_TAG_VALUES,
	CAPABILITY_TAG_DOCS,
).describe(
	'One capability tag from the fixed vocabulary: a task the model is good at, or one it is known to struggle with.',
);

/**
 * How the orchestrator reaches a provider. Structural mirror of
 * `IProviderInvoke`: a discriminated union on `kind` so a config cannot
 * mix, e.g., an api `url` with a cli `command`.
 */
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

/**
 * One account a provider runs on — the config mirror of
 * \`IProviderAccount\`. It names where a credential lives, never the
 * credential itself.
 */
export const PROVIDER_ACCOUNT_SCHEMA = z
	.object({
		accountId: z
			.string()
			.regex(KEBAB_ID_PATTERN)
			.describe('Unique kebab-case account id (e.g. "claude-work").'),
		vendor: z
			.string()
			.regex(KEBAB_ID_PATTERN)
			.describe(
				'The vendor this account belongs to (e.g. "anthropic", "openai"). Two accounts of one vendor are two separate logins, with their own quota and their own budget.',
			),
		displayName: z
			.string()
			.min(1)
			.optional()
			.describe(
				'A label for people, shown instead of the id. Purely cosmetic — nothing is derived from it, so change it whenever it reads better.',
			),
		credentialMode: documentedEnum(
			CREDENTIAL_MODES,
			CREDENTIAL_MODE_DOCS,
		).describe(
			"Who holds the credential this account uses: the vendor's own client, a plan token, a key the person brought, the editor, or nobody. It decides where the runner looks for the credential.",
		),
		billingMode: documentedEnum(BILLING_MODES, BILLING_MODE_DOCS).describe(
			'How the use of this account is paid for. It decides which budget pool its calls are counted against.',
		),
		credentialEnv: z
			.string()
			.regex(ENV_VAR_NAME_PATTERN)
			.describe(
				'NAME of the environment variable holding the credential. Never a literal secret — the config file is committed.',
			)
			.optional(),
		profileDir: z
			.string()
			.min(1)
			.describe(
				"The isolated directory the vendor's client keeps this account's login in (e.g. CLAUDE_CONFIG_DIR, CODEX_HOME).",
			)
			.optional(),
		quotaGroups: z
			.array(
				z
					.string()
					.regex(KEBAB_ID_PATTERN)
					.describe(
						'The name of one quota pool this account draws from (e.g. "team"). A pool belongs to a single account — two accounts never share one.',
					),
			)
			.default([])
			.describe(
				'The quota pools this account draws from. The vendor counts its limits per pool, so a second account of the same vendor needs a pool of its own.',
			),
		permittedAutomation: z
			.boolean()
			.default(false)
			.describe(
				'Whether work may run on this account while nobody is watching. Off unless said otherwise; turn it on for an account whose credential and limits allow unattended use.',
			),
		budgets: z
			.array(
				z
					.object({
						window: documentedEnum(
							['hourly', 'weekly', 'monthly'],
							BUDGET_WINDOW_DOCS,
						).describe(
							'The period the ceiling is counted over. Pick the window the person thinks in — an hour for a burst, a month for a standing spend.',
						),
						requests: z
							.number()
							.int()
							.positive()
							.describe(
								'How many requests this account may make in one window of that length.',
							),
					})
					.strict()
					.describe(
						'One ceiling: how many requests, over which window.',
					),
			)
			.optional()
			.describe(
				'What this account may spend per window where the vendor does not say what is left: requests per window, counted by the hops reserved on it.',
			),
	})
	.strict()
	.describe(
		'One account a provider runs on: where its credential lives, how its use is paid for, and what it may spend. The account never holds a secret itself — it names where the secret is.',
	);

/**
 * One provider in the roster — the config mirror of
 * \`IProviderCapabilities\`. \`accountId\` names the account it runs on; an
 * entry without one predates accounts and is still valid.
 */
export const PROVIDER_ENTRY_SCHEMA = z
	.object({
		id: z
			.string()
			.regex(KEBAB_ID_PATTERN)
			.describe('Unique kebab-case provider id (e.g. "claude-sonnet").'),
		kind: documentedEnum(
			[
				'api',
				'subscription',
				'cli',
				'mcp-server',
				'acp',
				'host-sampling',
			],
			PROVIDER_KIND_DOCS,
		).describe(
			"How the runner reaches this provider: a hosted API, a subscription, a command line client, an MCP server, an ACP agent, or the host's own model.",
		),
		invoke: PROVIDER_INVOKE_SCHEMA,
		modelId: z
			.string()
			.min(1)
			.describe(
				'The model this provider runs, as the provider\'s catalogue names it (e.g. "claude-sonnet-4-5"). The exact model, not the vendor.',
			),
		contextWindow: z
			.number()
			.int()
			.nonnegative()
			.describe(
				"How many tokens the model holds at once. Take it from the vendor's published figure; the router uses it to decide what fits into a single call.",
			),
		costTier: z
			.union([
				z.literal(1),
				z.literal(2),
				z.literal(3),
				z.literal(4),
				z.literal(5),
			])
			.describe(
				"A rough price ranking of the model, 1 (cheapest) to 5 (most expensive). Set it from the vendor's own pricing; the router leans on it whenever cost is the deciding factor.",
			),
		strengths: z
			.array(CAPABILITY_TAG_SCHEMA)
			.describe(
				'What this provider is good at. The router scores a slice against these tags, so list the ones it genuinely excels at and no more.',
			),
		weaknesses: z
			.array(CAPABILITY_TAG_SCHEMA)
			.describe(
				'Where this provider falls short. The router steers work away from a provider tagged with the weakness a slice needs.',
			),
		accountId: z
			.string()
			.regex(KEBAB_ID_PATTERN)
			.optional()
			.describe(
				'The account this provider runs on — which login, quota pool and budget it spends. Leave it out for a provider that predates accounts.',
			),
	})
	.strict()
	.describe(
		'One provider in the roster: a model, how to reach it, and what it is good at.',
	);
