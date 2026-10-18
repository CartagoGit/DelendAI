/**
 * What a person's project file may hold: accounts, and the account each
 * provider uses. Read by the personal layer and its migration.
 */
import { z } from 'zod';

import { PROVIDER_ACCOUNT_SCHEMA } from './provider-entry-schema.constant';

export const PERSONAL_LAYER_SCHEMA = z
	.object({
		accounts: z.array(PROVIDER_ACCOUNT_SCHEMA).optional(),
		providers: z
			.array(
				z
					.object({
						id: z.string().min(1),
						accountId: z.string().min(1),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();

/** The migration that moves one person's accounts to their own file. */
export const PERSONAL_ACCOUNTS_MIGRATOR_ID = 'personalAccountsMigrator:v1';
