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

const FLAGS = z.array(z.string().min(1));

export const KNOWN_CLIENT_SCHEMA = z
	.object({
		command: z.string().min(1).describe('The command it runs as.'),
		id: z.string().min(1).optional(),
		label: z.string().min(1).optional(),
		vendor: z.string().min(1),
		costTier: z.number().int().min(1).max(5).optional(),
		loginStatusArgs: FLAGS.optional(),
		profileVariable: z.string().min(1).optional(),
		loginDiscardingFlags: FLAGS.optional(),
		modelListArgs: FLAGS.optional(),
		loginKinds: z
			.array(
				z
					.object({
						pattern: z.string().min(1),
						credentialMode: z.enum(CREDENTIAL_MODES),
						billingMode: z.enum(BILLING_MODES),
					})
					.strict(),
			)
			.optional(),
		toolScope: z
			.object({
				restrict: z.string().min(1),
				approve: z.string().min(1).optional(),
			})
			.strict()
			.optional(),
		scopedHopArgs: FLAGS.optional(),
		noMcpArgs: FLAGS.optional(),
		mcpToolPrefix: z.string().min(1).optional(),
	})
	.strict();

/** What a declared client is installed with: nothing delendai runs. */
export const DECLARED_CLIENT_INSTALL = {
	tool: '',
	args: [],
	dangerous: false,
	caveat: 'Declared in configuration: install it the way its vendor says.',
} as const;
