/**
 * provider-entry-schema.constant.ts — the one schema of a provider roster entry
 * and of the account it runs on.
 *
 * The root `providers` and `accounts` blocks, the `--check` diagnostic
 * and the orchestrator-runner's own roster option all validate with these,
 * so a roster is portable between them and none of them drifts.
 */
import z from 'zod';

import { PROVIDER_INVOKE_SCHEMA } from './provider-invoke-schema.constant';
/**
 * `config-schema-docs.constant.ts` and `declared-agent-schema.constant.ts` import
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
import { documentedEnum } from '../../plugins/config-schema-docs';
import {
	BILLING_MODE_DOCS,
	BUDGET_WINDOW_DOCS,
	CAPABILITY_TAG_DOCS,
	CREDENTIAL_MODE_DOCS,
	PROVIDER_KIND_DOCS,
} from './config-schema-docs.constant';

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

/**
 * How the orchestrator reaches a provider. Re-exported from its own
 * module so every existing import path keeps working.
 */
export { PROVIDER_INVOKE_SCHEMA } from './provider-invoke-schema.constant';

export const CAPABILITY_TAG_SCHEMA = documentedEnum(
	CAPABILITY_TAG_VALUES,
	CAPABILITY_TAG_DOCS,
).describe(
	'One capability tag from the fixed vocabulary: a task the model is good at, or one it is known to struggle with.',
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
