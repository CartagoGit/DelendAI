/**
 * known-client-schema.constant.ts — a client entry a project or a person
 * declares in configuration, the same shape as `KNOWN_CLIENTS`.
 *
 * A client nobody shipped (a new vendor's CLI, a wrapper, a gateway) is
 * one entry in `delendai.config.json` or the person's file, not a release.
 */
import { z } from 'zod';

import {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from './provider-account-modes.constant';
import {
	BILLING_MODE_DOCS,
	CREDENTIAL_MODE_DOCS,
} from '../../plugins/config-schema-docs';
import { documentedEnumSchema } from './provider-entry-schema.constant';

const FLAGS = z.array(
	z
		.string()
		.min(1)
		.describe(
			'One command-line argument, passed to the client exactly as it is written.',
		),
);

export const KNOWN_CLIENT_SCHEMA = z
	.object({
		command: z.string().min(1).describe('The command it runs as.'),
		id: z
			.string()
			.min(1)
			.optional()
			.describe(
				'The id discovery reports this client under (e.g. "claude-cli"). Use it to refer to the client in configuration; leave it out for a client nobody refers to.',
			),
		label: z
			.string()
			.min(1)
			.optional()
			.describe(
				'The name shown to people. Purely cosmetic — nothing is derived from it, so change it whenever it reads better.',
			),
		vendor: z
			.string()
			.min(1)
			.describe(
				'The vendor that ships this client (e.g. "anthropic"). It decides which account and which billing mode a login found through it carries.',
			),
		costTier: z
			.number()
			.int()
			.min(1)
			.max(5)
			.optional()
			.describe(
				'A rough price ranking of the client default model, 1 (cheapest) to 5 (most expensive). It is the first pass whenever cost is the deciding factor.',
			),
		loginStatusArgs: FLAGS.optional().describe(
			'The arguments that make the client print whether it is logged in (e.g. ["auth", "status"]). The runner calls the client with them to find out whether a session exists at all.',
		),
		profileVariable: z
			.string()
			.min(1)
			.optional()
			.describe(
				'NAME of the environment variable the client reads its profile directory from (e.g. "CLAUDE_CONFIG_DIR"). Never the directory itself — it differs from machine to machine.',
			),
		loginDiscardingFlags: FLAGS.optional().describe(
			'The flags that make the client ignore a subscription login (e.g. ["--bare"]). Used to start from a clean slate; never alongside a real login.',
		),
		modelListArgs: FLAGS.optional().describe(
			'The arguments that make the client list the models it can reach, one "provider/model" per line (e.g. ["models"]). Used to fill the model catalogue from the client itself.',
		),
		loginKinds: z
			.array(
				z
					.object({
						pattern: z
							.string()
							.min(1)
							.describe(
								'A regular expression source, matched case-insensitively against what the client reports about the session. The first kind that matches wins.',
							),
						credentialMode: documentedEnumSchema(
							CREDENTIAL_MODES,
							CREDENTIAL_MODE_DOCS,
						).describe(
							'Who holds the credential behind a login of this kind.',
						),
						billingMode: documentedEnumSchema(
							BILLING_MODES,
							BILLING_MODE_DOCS,
						).describe('How a login of this kind is paid for.'),
					})
					.strict()
					.describe('One kind of login this client can hold.'),
			)
			.optional()
			.describe(
				'The kinds of login this client supports. A client can hold several — a subscription session and a key-based one, say — and each is recognised by its own pattern.',
			),
		toolScope: z
			.object({
				restrict: z
					.string()
					.min(1)
					.describe(
						'The flag that limits the tools that exist in the client context (e.g. "--tools"). It is what the hop pays for on every turn.',
					),
				approve: z
					.string()
					.min(1)
					.optional()
					.describe(
						'The flag that pre-approves those tools for a run nobody answers prompts in (e.g. "--allowedTools"). Leave it out while a person is watching.',
					),
			})
			.strict()
			.optional()
			.describe(
				'How a delegated hop is told which tools it may use. Narrow it when the client does more than the work at hand needs.',
			),
		scopedHopArgs: FLAGS.optional().describe(
			'The flags that leave out what a hop scoped to its tools never uses (e.g. ["--disable-slash-commands"]). They trim the context every turn pays for.',
		),
		noMcpArgs: FLAGS.optional().describe(
			'The flags that load no MCP server (e.g. ["--strict-mcp-config"]). Used for a scoped hop whose tools name none.',
		),
		mcpToolPrefix: z
			.string()
			.min(1)
			.optional()
			.describe(
				'How this client names a tool an MCP server provides (e.g. "mcp__"). The prefix tells the runner which of the allowed tools come from an MCP server.',
			),
	})
	.strict()
	.describe(
		'One client the project or the person declares: the command it runs as, how to ask it about its login, and what it is allowed to do.',
	);

/** What a declared client is installed with: nothing delendai runs. */
export const DECLARED_CLIENT_INSTALL = {
	tool: '',
	args: [],
	dangerous: false,
	caveat: 'Declared in configuration: install it the way its vendor says.',
} as const;
