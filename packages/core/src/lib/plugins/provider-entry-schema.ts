/**
 * provider-entry-schema.ts — a roster entry or an account, checked against
 * the one schema the root blocks and `--check` use.
 */
import {
	PROVIDER_ACCOUNT_SCHEMA,
	PROVIDER_ENTRY_SCHEMA,
} from '../contracts/constants/provider-entry-schema.constant';

/** One root roster entry, checked by the schema \`--check\` uses. */
export const parseProviderEntry = (entry: unknown) =>
	PROVIDER_ENTRY_SCHEMA.safeParse(entry);

/** One root account, checked by the schema \`--check\` uses. */
export const parseProviderAccount = (entry: unknown) =>
	PROVIDER_ACCOUNT_SCHEMA.safeParse(entry);
