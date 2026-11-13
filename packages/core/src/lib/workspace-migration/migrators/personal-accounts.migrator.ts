/**
 * personal-accounts.migrator.ts — a person's accounts leave the committed
 * configuration for their personal file.
 *
 * An account with a `profileDir` or a `credentialEnv` in
 * `delendai.config.json` is one person's login, declared for everyone who
 * opens the project. It moves to the personal file of the person running
 * this start (`personal-layer.service.ts`); an account a team declares
 * with neither field is shared on purpose and stays.
 *
 * A shared provider bound to a moving account moves its binding too: the
 * provider stays shared, and the account it runs on becomes the person's
 * (`providers[].accountId` in their file). Left in the shared file, the
 * binding named an account every other person lacks.
 *
 * The personal file is written first and the shared one second, each
 * atomically, private to its owner, and under one mutex: two starts at
 * once (two agents opening the project) move each account once.
 * Interrupted between the two writes, the account is in both, the
 * personal entry wins the merge, and the next start removes the shared
 * copy. Comments in the shared file survive (`jsonc-parser` edits).
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import {
	personalLayerPath,
	projectIdentity,
} from '../../plugins/personal-layer.service';
import { mergeIntoPersonalLayer } from '../../plugins/personal-layer-writer.service';
import { writeFileAtomic } from '../../shared/atomic-write';
import { withFileMutex } from '../../shared/with-file-mutex';
import {
	PERSONAL_ACCOUNTS_MIGRATOR_ID,
	PERSONAL_DIRECTORY_MODE,
} from '../../contracts/constants/personal-layer-schema.constant';

const CONFIG_FILE = 'delendai.config.json';

interface IRawAccount {
	readonly accountId?: unknown;
	readonly profileDir?: unknown;
	readonly credentialEnv?: unknown;
}

const readText = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return undefined;
	}
};

/** Whether an account names one person's login. */
const isPersonal = (account: IRawAccount): boolean =>
	account.profileDir !== undefined || account.credentialEnv !== undefined;

interface IRawProvider {
	readonly id?: unknown;
	readonly accountId?: unknown;
}

const listOf = <T>(text: string | undefined, key: string): readonly T[] => {
	if (text === undefined) return [];
	const value: unknown = parseJsonc(text);
	if (value === null || typeof value !== 'object') return [];
	const list = (value as Record<string, unknown>)[key];
	return Array.isArray(list) ? (list as T[]) : [];
};

const accountsOf = (text: string | undefined): readonly IRawAccount[] =>
	listOf<IRawAccount>(text, 'accounts');

const providersOf = (text: string | undefined): readonly IRawProvider[] =>
	listOf<IRawProvider>(text, 'providers');

/** `text` with `path` removed, for every index `drop` picks, last first. */
const withoutEach = (
	text: string,
	count: number,
	drop: (index: number) => boolean,
	path: (index: number) => (string | number)[],
): string => {
	let working = text;
	for (let index = count - 1; index >= 0; index -= 1) {
		if (!drop(index)) continue;
		working = applyEdits(
			working,
			modify(working, path(index), undefined, {
				formattingOptions: { insertSpaces: false, tabSize: 1 },
			}),
		);
	}
	return working;
};

/** The migrator, with where personal files live (default: this user's). */
export const createPersonalAccountsMigrator = (
	personalRoot?: string,
): IMigration => {
	const sharedPath = (ctx: IMigrationContext): string =>
		join(ctx.workspaceRoot, CONFIG_FILE);
	const personalOf = async (ctx: IMigrationContext) => {
		const text = await readText(sharedPath(ctx));
		return {
			text,
			moving: accountsOf(text).filter(isPersonal),
		};
	};
	/** Both files, read again under the mutex: a start before us may have moved them. */
	const move = async (ctx: IMigrationContext, target: string) => {
		const { text, moving } = await personalOf(ctx);
		if (text === undefined || moving.length === 0) return;
		const ids = new Set(moving.map((account) => String(account.accountId)));
		const providers = providersOf(text);
		// What the person already declared wins: the writer keeps it.
		await mergeIntoPersonalLayer(target, {
			accounts: moving.map((account) => ({ ...account })),
			providers: providers
				.filter((provider) => ids.has(String(provider.accountId)))
				.map((provider) => ({
					id: String(provider.id),
					accountId: String(provider.accountId),
				})),
		});
		const accounts = accountsOf(text);
		const unbound = withoutEach(
			text,
			providers.length,
			(index) => ids.has(String(providers[index]?.accountId)),
			(index) => ['providers', index, 'accountId'],
		);
		const working = withoutEach(
			unbound,
			accounts.length,
			(index) => ids.has(String(accounts[index]?.accountId)),
			(index) => ['accounts', index],
		);
		if (working !== text) await writeFileAtomic(sharedPath(ctx), working);
	};
	return {
		id: PERSONAL_ACCOUNTS_MIGRATOR_ID,

		detect: async (ctx) => (await personalOf(ctx)).moving.length > 0,

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> =>
			(await personalOf(ctx)).moving.map((account) => ({
				kind: 'move-account-to-personal-layer',
				detail: `${CONFIG_FILE}: account "${String(account.accountId)}" names one person's login; it moves to that person's file outside the repository`,
			})),

		apply: async (ctx) => {
			const target = personalLayerPath(
				await projectIdentity(ctx.workspaceRoot),
				personalRoot,
			);
			await mkdir(dirname(target), {
				recursive: true,
				mode: PERSONAL_DIRECTORY_MODE,
			});
			await withFileMutex(target, () => move(ctx, target), {
				onContention: 'wait',
			});
		},
	};
};
