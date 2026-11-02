/**
 * migration-preview.service.ts — what the start-up guard would do,
 * found by doing it on a scratch copy of the workspace.
 */
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { IConfigTransition } from '../contracts/interfaces/config-transition.interface';
import type {
	IMigration,
	IMigrationJournal,
	IMigrationRunResult,
} from '../contracts/interfaces/workspace-migration.interface';
import { appliedCacheDir } from '../shared/delendai-records';

/** What the guard is run with. */
interface IPreviewInput {
	readonly migrations: readonly IMigration[];
	readonly journal: IMigrationJournal;
	readonly workspaceRoot: string;
	readonly transitions?: readonly IConfigTransition[];
}

/** What a scratch copy leaves out: installed packages and the repository. */
const PREVIEW_EXCLUDED = new Set(['node_modules', '.git']);

/** The cache folder the previews run in. */
const PREVIEW_DIR = 'migrate-preview';

/**
 * Copy `from` into `into`, which lives inside it, leaving out `skip`
 * (the previews folder) and the excluded names. A folder that holds
 * `into` is walked entry by entry; anything else is copied whole.
 */
const copyWorkspaceInto = async (
	from: string,
	into: string,
	skip: string,
	at = from,
): Promise<void> => {
	for (const entry of await readdir(at, { withFileTypes: true })) {
		if (PREVIEW_EXCLUDED.has(entry.name)) continue;
		const source = join(at, entry.name);
		if (source === skip) continue;
		const target = join(into, relative(from, source));
		if (entry.isDirectory() && skip.startsWith(`${source}${sep}`)) {
			await mkdir(target, { recursive: true });
			await copyWorkspaceInto(from, into, skip, source);
			continue;
		}
		await cp(source, target, {
			recursive: true,
			filter: (path) =>
				!relative(source, path)
					.split(sep)
					.some((part) => PREVIEW_EXCLUDED.has(part)),
		});
	}
};

/**
 * What the guard would do, found by doing it on a copy. Migrations build
 * on each other (one renames the config file the next one reads), so a
 * plan made before any of them applies misses what the earlier ones
 * unlock; the copy runs the whole route for real and its outcomes are
 * the plan. The workspace and its journal are not touched: the copy
 * records into a journal of its own, seeded with what is applied here.
 */
export const previewInScratchCopy = async (
	input: IPreviewInput,
	/** The guard itself, run for real on the copy. */
	route: (input: IPreviewInput) => Promise<IMigrationRunResult>,
): Promise<IMigrationRunResult> => {
	// Inside the workspace's own cache, where scratch is found and cleaned;
	// the copy leaves that folder out, or it would copy itself.
	const previews = join(
		input.workspaceRoot,
		appliedCacheDir(input.workspaceRoot),
		PREVIEW_DIR,
	);
	await mkdir(previews, { recursive: true });
	const scratch = await mkdtemp(join(previews, 'run-'));
	try {
		await copyWorkspaceInto(input.workspaceRoot, scratch, previews);
		const applied = new Set(await input.journal.read(input.workspaceRoot));
		const journal: IMigrationJournal = {
			read: async () => [...applied],
			record: async (_root, id) => {
				applied.add(id);
			},
		};
		const done = await route({
			migrations: input.migrations,
			journal,
			workspaceRoot: scratch,
			...(input.transitions === undefined
				? {}
				: { transitions: input.transitions }),
		});
		return {
			outcomes: done.outcomes.map((outcome) =>
				outcome.status === 'migrated'
					? {
							status: 'planned',
							id: outcome.id,
							steps: outcome.steps ?? [],
						}
					: outcome,
			),
			acted: done.acted,
			...(done.transitions === undefined
				? {}
				: {
						transitions: {
							...done.transitions,
							outcomes: done.transitions.outcomes.map(
								(outcome) =>
									outcome.status === 'applied'
										? {
												...outcome,
												status: 'planned' as const,
											}
										: outcome,
							),
						},
					}),
		};
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
};
