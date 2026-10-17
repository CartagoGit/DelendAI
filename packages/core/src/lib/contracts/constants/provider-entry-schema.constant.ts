/**
 * provider-entry-schema.constant.ts — the one schema of a provider roster entry
 * and of the account it runs on.
 *
 * The root `providers` and `accounts` blocks, the `--check` diagnostic
 * and the orchestrator-runner's own roster option all validate with these,
 * so a roster is portable between them and none of them drifts.
 */
import z from 'zod';
import {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from './provider-account-modes.constant';
import { CAPABILITY_TAGS } from '../interfaces/provider-capabilities.interface';

/** Kebab-case id: `claude-sonnet`, `gpt-5-codex`, `claude-work`, … */
const KEBAB_ID_PATTERN = /^[a-z][a-z0-9-]+$/;

/** Name of an environment variable — never its value. */
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export const CAPABILITY_TAG_SCHEMA = z.enum(CAPABILITY_TAGS);

/**
 * How the orchestrator reaches a provider. Structural mirror of
 * `IProviderInvoke`: a discriminated union on `kind` so a config cannot
 * mix, e.g., an api `url` with a cli `command`.
 */
export const PROVIDER_INVOKE_SCHEMA = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('api'),
			url: z.string(),
			method: z.enum(['GET', 'POST']).optional(),
			envVar: z
				.string()
				.describe(
					'NAME of the environment variable holding the API key (e.g. "OPENAI_API_KEY"). Never put a literal secret here — the config file is committed.',
				),
		})
		.strict(),
	z
		.object({
			kind: z.literal('subscription'),
			// (F7): any non-empty id is accepted — core no longer
			// closes this to the hosts it happened to know about at
			// authoring time. orchestrator-runner owns validating it
			// against the hosts it can actually drive.
			tool: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal('cli'),
			command: z.string(),
			args: z.array(z.string()).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('mcp-server'),
			server: z.string(),
			tool: z.string(),
			args: z.record(z.string(), z.unknown()),
		})
		.strict(),
]);

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
		vendor: z.string().regex(KEBAB_ID_PATTERN),
		displayName: z.string().min(1).optional(),
		credentialMode: z.enum(CREDENTIAL_MODES),
		billingMode: z.enum(BILLING_MODES),
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
		quotaGroups: z.array(z.string().regex(KEBAB_ID_PATTERN)).default([]),
		permittedAutomation: z.boolean().default(false),
	})
	.strict();

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
		kind: z.enum(['api', 'subscription', 'cli', 'mcp-server']),
		invoke: PROVIDER_INVOKE_SCHEMA,
		modelId: z.string().min(1),
		contextWindow: z.number().int().nonnegative(),
		costTier: z.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		]),
		strengths: z.array(CAPABILITY_TAG_SCHEMA),
		weaknesses: z.array(CAPABILITY_TAG_SCHEMA),
		accountId: z.string().regex(KEBAB_ID_PATTERN).optional(),
	})
	.strict();
