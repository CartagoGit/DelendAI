/**
 * personal-layer.service.ts — a person's own configuration for a project,
 * kept outside the repository and merged over what the project shares.
 *
 * `delendai.config.json` is committed: an account declared there, with
 * its profile directory, was declared for everyone who opens the
 * project, and nobody could hold theirs differently (one person through
 * a plan, another through a key). A person's accounts live in a file of
 * their own under the user configuration root instead, one per project,
 * and replace a shared account with the same id whole.
 */
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';
import { PROVIDER_ACCOUNT_SCHEMA } from '../contracts/constants/provider-entry-schema.constant';
import { thisUserConfigRoot } from '../platform/user-directories.helper';
import { readGit } from '../shared/git-read.helper';
import type { IDelendaiConfigFile } from './load-config-file';

/** Which layer an account came from. */
export type TAccountLayer = 'shared' | 'personal';

/** What a person's file may hold: accounts, and the account a provider uses. */
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

export type IPersonalLayer = z.infer<typeof PERSONAL_LAYER_SCHEMA>;

/** How many hex characters of the identity hash name the file. */
const KEY_LENGTH = 16;

/**
 * A remote URL as one string per repository: scheme, credentials, the
 * `.git` suffix and case of the host dropped, and `git@host:owner/repo`
 * read as `host/owner/repo`, so an SSH clone and an HTTPS clone agree.
 */
export const normalizeRemoteUrl = (url: string): string => {
	const trimmed = url
		.trim()
		.replace(/\.git$/u, '')
		.replace(/\/+$/u, '');
	const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/u.exec(trimmed);
	if (scp !== null) {
		return `${(scp[1] ?? '').toLowerCase()}/${scp[2] ?? ''}`;
	}
	const parsed =
		/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/iu.exec(
			trimmed,
		);
	if (parsed !== null) {
		return `${(parsed[1] ?? '').toLowerCase()}/${parsed[2] ?? ''}`;
	}
	return trimmed;
};

/**
 * The project's identity: the fetch URL of its first remote (`origin`
 * when there is one), else the workspace's real path. Two clones of one
 * repository share it; two repositories never do.
 */
export const projectIdentity = (workspaceRoot: string): string => {
	const remotes = (readGit(workspaceRoot, ['remote']) ?? '')
		.split('\n')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	const remote = remotes.includes('origin') ? 'origin' : remotes[0];
	const url =
		remote === undefined
			? undefined
			: readGit(workspaceRoot, ['remote', 'get-url', remote]);
	if (url !== undefined && url.trim().length > 0) {
		return `remote:${normalizeRemoteUrl(url)}`;
	}
	let real = resolve(workspaceRoot);
	try {
		real = realpathSync(real);
	} catch {
		// A workspace that does not exist yet is named by its path.
	}
	return `path:${real}`;
};

/** The personal file of the project whose identity is `identity`. */
export const personalLayerPath = (
	identity: string,
	root: string = defaultPersonalRoot(),
): string =>
	join(
		root,
		'delendai',
		'projects',
		`${createHash('sha256').update(identity).digest('hex').slice(0, KEY_LENGTH)}.json`,
	);

/** This machine's user configuration root, from the environment. */
export const defaultPersonalRoot = (): string => thisUserConfigRoot();

/** A person's file read: its layer, or why it was not taken. */
export const parsePersonalLayer = (
	raw: string | undefined,
): { readonly layer: IPersonalLayer; readonly issue?: string } => {
	if (raw === undefined) return { layer: {} };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		return {
			layer: {},
			issue: `does not parse: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	const parsed = PERSONAL_LAYER_SCHEMA.safeParse(value);
	return parsed.success
		? { layer: parsed.data }
		: {
				layer: {},
				issue: parsed.error.issues
					.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
					.join('; '),
			};
};

/** A parsed account as the registry holds it: no key set to `undefined`. */
const asAccount = (
	account: NonNullable<IPersonalLayer['accounts']>[number],
): IProviderAccount => {
	const { displayName, credentialEnv, profileDir, ...rest } = account;
	return {
		...rest,
		...(displayName === undefined ? {} : { displayName }),
		...(credentialEnv === undefined ? {} : { credentialEnv }),
		...(profileDir === undefined ? {} : { profileDir }),
	};
};

/**
 * The shared configuration with a person's layer over it. Accounts merge
 * by `accountId`: a personal entry replaces a shared one whole, so one
 * person's plan and another's key never mix fields, and a new id is
 * added. A personal provider binding sets the account of the shared
 * provider with that id.
 */
export const withPersonalLayer = (
	shared: IDelendaiConfigFile,
	personal: IPersonalLayer,
): {
	readonly config: IDelendaiConfigFile;
	readonly layers: ReadonlyMap<string, TAccountLayer>;
} => {
	const layers = new Map<string, TAccountLayer>();
	const merged = new Map<string, IProviderAccount>();
	for (const account of shared.accounts ?? []) {
		merged.set(account.accountId, account);
		layers.set(account.accountId, 'shared');
	}
	for (const account of personal.accounts ?? []) {
		merged.set(account.accountId, asAccount(account));
		layers.set(account.accountId, 'personal');
	}
	const bindings = new Map(
		(personal.providers ?? []).map((entry) => [entry.id, entry.accountId]),
	);
	const providers =
		shared.providers === undefined || bindings.size === 0
			? shared.providers
			: shared.providers.map((provider) => {
					const accountId = bindings.get(provider.id);
					return accountId === undefined
						? provider
						: { ...provider, accountId };
				});
	const hasAccounts = merged.size > 0 || shared.accounts !== undefined;
	return {
		config: {
			...shared,
			...(hasAccounts ? { accounts: [...merged.values()] } : {}),
			...(providers === undefined ? {} : { providers }),
		},
		layers,
	};
};
