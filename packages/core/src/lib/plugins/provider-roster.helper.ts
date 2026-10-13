/**
 * provider-roster.helper.ts — the root \`providers\` roster, as plugins
 * receive it: only the entries that validate.
 *
 * The config parser casts what it reads, and a schema diagnostic never
 * stops a start, so a roster entry with a typo would reach a plugin that
 * then routes work to it. Each entry is checked against the schema the
 * \`--check\` diagnostic uses; an invalid one is left out and named.
 */
import type { IProviderCapabilities } from '../contracts/interfaces/provider-capabilities.interface';
import type { IProviderRoster } from '../contracts/interfaces/provider-roster.interface';
import { PROVIDER_ENTRY_SCHEMA } from './config-file-schema';

export const validProviderRoster = (raw: unknown): IProviderRoster => {
	if (!Array.isArray(raw)) return { providers: [], rejected: [] };
	const providers: IProviderCapabilities[] = [];
	const rejected: { index: number; id?: string; reason: string }[] = [];
	const seen = new Set<string>();
	raw.forEach((entry: unknown, index) => {
		const parsed = PROVIDER_ENTRY_SCHEMA.safeParse(entry);
		const id =
			typeof entry === 'object' &&
			entry !== null &&
			typeof (entry as { id?: unknown }).id === 'string'
				? (entry as { id: string }).id
				: undefined;
		if (!parsed.success) {
			rejected.push({
				index,
				...(id === undefined ? {} : { id }),
				reason: parsed.error.issues[0]?.message ?? 'invalid entry',
			});
			return;
		}
		if (seen.has(parsed.data.id)) {
			rejected.push({
				index,
				id: parsed.data.id,
				reason: `duplicate provider id "${parsed.data.id}"`,
			});
			return;
		}
		seen.add(parsed.data.id);
		providers.push(parsed.data as IProviderCapabilities);
	});
	return { providers, rejected };
};
