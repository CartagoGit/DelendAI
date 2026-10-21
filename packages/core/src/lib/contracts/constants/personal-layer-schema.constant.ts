/**
 * What a person's project file may hold: accounts, and the account each
 * provider uses. Read by the personal layer and its migration.
 */
import { z } from 'zod';

import { CATALOGUE_SOURCES_SCHEMA } from './catalogue-sources-schema.constant';
import { DECLARED_AGENT_SCHEMA } from './declared-agent-schema.constant';
import { KNOWN_CLIENT_SCHEMA } from './known-client-schema.constant';
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
		/** Clients this person declares beside the catalogue, by command. */
		clients: z.array(KNOWN_CLIENT_SCHEMA).optional(),
		/** Public catalogues this person reads before the defaults. */
		catalogues: CATALOGUE_SOURCES_SCHEMA.optional(),
		/** Agents this person declares beside the catalogues. */
		agents: z.array(DECLARED_AGENT_SCHEMA).optional(),
		/** Accounts this person was offered and said no to: not offered again. */
		declinedOffers: z.array(z.string().min(1)).optional(),
	})
	.strict();

/**
 * A personal file names one person's logins (profile folders, credential
 * variables): only its owner reads it, in a folder only its owner lists.
 */
export const PERSONAL_FILE_MODE = 0o600;
export const PERSONAL_DIRECTORY_MODE = 0o700;

/** The migration that moves one person's accounts to their own file. */
export const PERSONAL_ACCOUNTS_MIGRATOR_ID = 'personalAccountsMigrator:v1';
