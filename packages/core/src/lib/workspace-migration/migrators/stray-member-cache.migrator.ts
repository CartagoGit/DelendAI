/**
 * stray-member-cache.migrator.ts — the caches a server wrote inside a
 * member of the workspace go.
 *
 * A server started with its working directory inside a workspace member
 * (`packages/core`) took that directory for the workspace and wrote its
 * cache there: `packages/core/.cache/delendai`, with runtime events and
 * evidence nobody reads, flagged by `lint:cache` on every reviewer's run.
 * The server now serves the nearest configured workspace instead; this
 * removes what the old behaviour left. Only a cache made of regenerable
 * entries goes; anything else is reported for a person, and a member that
 * is a project of its own keeps its cache.
 */
import { access, readdir, rm, rmdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { DEFAULT_CONFIG_FILENAME } from '../../plugins/load-config-file';
import {
	MEMBER_CACHE_SEGMENTS,
	NOT_MEMBER_DIRECTORIES,
	REGENERABLE_CACHE_ENTRIES,
	STRAY_MEMBER_CACHE_MIGRATOR_ID,
} from './stray-member-cache.constant';

const exists = async (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

const subdirectories = async (dir: string): Promise<string[]> =>
	(await readdir(dir, { withFileTypes: true }).catch(() => []))
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!NOT_MEMBER_DIRECTORIES.includes(entry.name),
		)
		.map((entry) => join(dir, entry.name));

/** The members of the workspace: its directories one and two levels down. */
const membersOf = async (root: string): Promise<string[]> => {
	const first = await subdirectories(root);
	const second = (await Promise.all(first.map(subdirectories))).flat();
	return [...first, ...second];
};

interface IStrayCache {
	readonly dir: string;
	readonly unknown: readonly string[];
}

const strayCaches = async (root: string): Promise<IStrayCache[]> => {
	const found: IStrayCache[] = [];
	for (const member of await membersOf(root)) {
		const dir = join(member, ...MEMBER_CACHE_SEGMENTS);
		if (!(await exists(dir))) continue;
		// A member with its own configuration is a project: its cache is its own.
		if (await exists(join(member, DEFAULT_CONFIG_FILENAME))) continue;
		const entries = await readdir(dir).catch(() => [] as string[]);
		found.push({
			dir,
			unknown: entries.filter(
				(entry) => !REGENERABLE_CACHE_ENTRIES.includes(entry),
			),
		});
	}
	return found;
};

const stepsFor = async (
	ctx: IMigrationContext,
): Promise<IMigrationPlanStep[]> =>
	(await strayCaches(ctx.workspaceRoot)).map(({ dir, unknown }) => {
		const where = relative(ctx.workspaceRoot, dir);
		return unknown.length === 0
			? {
					kind: 'remove',
					detail: `${where}: a cache a server wrote inside a workspace member; everything in it regenerates`,
				}
			: {
					kind: 'conflict',
					detail: `${where} holds ${unknown.join(', ')}, which do not regenerate; it is left for a person to look at`,
				};
	});

export const createStrayMemberCacheMigrator = (): IMigration => ({
	id: STRAY_MEMBER_CACHE_MIGRATOR_ID,
	detect: async (ctx) => (await strayCaches(ctx.workspaceRoot)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		for (const { dir, unknown } of await strayCaches(ctx.workspaceRoot)) {
			if (unknown.length > 0) continue;
			await rm(dir, { recursive: true, force: true });
			// `.cache` goes too when nothing else is in it.
			const parent = join(dir, '..');
			if ((await readdir(parent).catch(() => ['?'])).length === 0)
				await rmdir(parent);
		}
	},
});
