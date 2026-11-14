/**
 * provider-roster.helper.ts — the root \`providers\` roster and the
 * \`accounts\` it runs on, as plugins receive them: only the entries that
 * validate.
 *
 * The config parser casts what it reads, and a schema diagnostic never
 * stops a start, so a roster entry with a typo would reach a plugin that
 * then routes work to it. Each entry is checked against the schema the
 * \`--check\` diagnostic uses, and the accounts against the same registry
 * rules; an invalid one is left out and named. A roster entry naming an
 * account left out is left out too, so nothing runs on an account the
 * registry refused.
 */
import type {
	IAccountRegistryIssue,
	IProviderAccount,
} from '../contracts/interfaces/provider-account.interface';
import type { IProviderCapabilities } from '../contracts/interfaces/provider-capabilities.interface';
import type {
	IProviderRoster,
	IRosterRejection,
} from '../contracts/interfaces/provider-roster.interface';
import { accountIssues, unknownAccountIssues } from './account-registry.helper';
import {
	parseProviderAccount,
	parseProviderEntry,
} from './provider-entry-schema';

const declaredString = (entry: unknown, key: string): string | undefined => {
	if (typeof entry !== 'object' || entry === null) return undefined;
	const value = (entry as Record<string, unknown>)[key];
	return typeof value === 'string' ? value : undefined;
};

/** The entries of \`raw\` that parse, each with its declared index. */
const parsedEntries = <T>(
	raw: unknown,
	block: IRosterRejection['block'],
	idKey: string,
	parse: (
		entry: unknown,
	) =>
		| { success: true; data: T }
		| { success: false; error: { issues: { message: string }[] } },
	rejected: IRosterRejection[],
): { index: number; data: T }[] => {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((entry: unknown, index) => {
		const parsed = parse(entry);
		if (parsed.success) return [{ index, data: parsed.data }];
		const id = declaredString(entry, idKey);
		rejected.push({
			block,
			index,
			...(id === undefined ? {} : { id }),
			reason: parsed.error.issues[0]?.message ?? 'invalid entry',
		});
		return [];
	});
};

/** Keeps the entries no issue names; the named ones become rejections. */
const withoutIssues = <T>(
	entries: { index: number; data: T }[],
	issues: IAccountRegistryIssue[],
	idOf: (data: T) => string,
	rejected: IRosterRejection[],
): { index: number; data: T }[] =>
	entries.filter((entry, position) => {
		const issue = issues.find((candidate) => candidate.index === position);
		if (issue === undefined) return true;
		rejected.push({
			block: issue.block,
			index: entry.index,
			id: idOf(entry.data),
			reason: issue.message,
		});
		return false;
	});

const duplicateIdIssues = (
	providers: readonly { readonly id: string }[],
): IAccountRegistryIssue[] => {
	const seen = new Set<string>();
	return providers.flatMap((provider, index) => {
		if (!seen.has(provider.id)) {
			seen.add(provider.id);
			return [];
		}
		return [
			{
				block: 'providers' as const,
				index,
				field: 'id',
				message: `duplicate provider id "${provider.id}"`,
			},
		];
	});
};

export const validProviderRoster = (
	rawProviders: unknown,
	rawAccounts?: unknown,
): IProviderRoster => {
	const rejected: IRosterRejection[] = [];
	const parsedAccounts = parsedEntries(
		rawAccounts,
		'accounts',
		'accountId',
		parseProviderAccount,
		rejected,
	);
	const accounts = withoutIssues(
		parsedAccounts,
		accountIssues(parsedAccounts.map((entry) => entry.data)),
		(account) => account.accountId,
		rejected,
	).map((entry) => entry.data as IProviderAccount);
	const declared = new Set(accounts.map((account) => account.accountId));
	const parsedProviders = parsedEntries(
		rawProviders,
		'providers',
		'id',
		parseProviderEntry,
		rejected,
	);
	const unique = withoutIssues(
		parsedProviders,
		duplicateIdIssues(parsedProviders.map((entry) => entry.data)),
		(provider) => provider.id,
		rejected,
	);
	const providers = withoutIssues(
		unique,
		unknownAccountIssues(
			unique.map((entry) => entry.data),
			declared,
		),
		(provider) => provider.id,
		rejected,
	).map((entry) => entry.data as IProviderCapabilities);
	rejected.sort(
		(a, b) => a.block.localeCompare(b.block) || a.index - b.index,
	);
	return { providers, accounts, rejected };
};
