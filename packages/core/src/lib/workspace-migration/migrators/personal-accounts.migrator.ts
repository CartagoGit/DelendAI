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
 * The personal file is written first and the shared one second, each
 * atomically: interrupted between the two, the account is in both, the
 * personal entry wins the merge, and the next start removes the shared
 * copy. Comments in the shared file survive (`jsonc-parser` edits).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import {
	parsePersonalLayer,
	personalLayerPath,
	projectIdentity,
} from '../../plugins/personal-layer.service';
import { writeFileAtomic } from '../../shared/atomic-write';

export const PERSONAL_ACCOUNTS_MIGRATOR_ID = 'personalAccountsMigrator:v1';

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

const accountsOf = (text: string | undefined): readonly IRawAccount[] => {
	if (text === undefined) return [];
	const value: unknown = parseJsonc(text);
	if (value === null || typeof value !== 'object') return [];
	const accounts = (value as { accounts?: unknown }).accounts;
	return Array.isArray(accounts) ? (accounts as IRawAccount[]) : [];
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
	return {
		id: PERSONAL_ACCOUNTS_MIGRATOR_ID,

		detect: async (ctx) => (await personalOf(ctx)).moving.length > 0,

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> =>
			(await personalOf(ctx)).moving.map((account) => ({
				kind: 'move-account-to-personal-layer',
				detail: `${CONFIG_FILE}: account "${String(account.accountId)}" names one person's login; it moves to that person's file outside the repository`,
			})),

		apply: async (ctx) => {
			const { text, moving } = await personalOf(ctx);
			if (text === undefined || moving.length === 0) return;
			const target = personalLayerPath(
				projectIdentity(ctx.workspaceRoot),
				personalRoot,
			);
			const current = parsePersonalLayer(await readText(target));
			if (current.issue !== undefined) {
				throw new Error(
					`personal configuration ${target} ${current.issue}: fix or remove it, then start again`,
				);
			}
			const held = new Set(
				(current.layer.accounts ?? []).map((each) => each.accountId),
			);
			// What the person already declared wins: it is newer than
			// what the project carried for them.
			const added = moving.filter(
				(account) => !held.has(String(account.accountId)),
			);
			if (added.length > 0) {
				await writeFileAtomic(
					target,
					`${JSON.stringify(
						{
							...current.layer,
							accounts: [
								...(current.layer.accounts ?? []),
								...added,
							],
						},
						null,
						'\t',
					)}\n`,
				);
			}
			const ids = new Set(moving.map((account) => account.accountId));
			let working = text;
			const accounts = accountsOf(text);
			for (let index = accounts.length - 1; index >= 0; index -= 1) {
				if (!ids.has(accounts[index]?.accountId)) continue;
				working = applyEdits(
					working,
					modify(working, ['accounts', index], undefined, {
						formattingOptions: { insertSpaces: false, tabSize: 1 },
					}),
				);
			}
			if (working !== text)
				await writeFileAtomic(sharedPath(ctx), working);
		},
	};
};
