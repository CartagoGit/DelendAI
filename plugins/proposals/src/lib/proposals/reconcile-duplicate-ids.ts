/**
 * reconcile-duplicate-ids.ts — one copy of each proposal id, the one
 * furthest along the state machine.
 *
 * WHY it exists: two branches that move one proposal each leave the file
 * in a different folder (a create pull request keeps it in `ready/`, the
 * slices that followed moved it to `review/`). A merge of both is clean
 * for git, which sees two paths, and leaves the same id twice. The
 * registry refuses a duplicate id, so every transition failed until the
 * stale copy was removed by hand.
 *
 * The copy that was moved last is the truth: latest `last-transition-at`,
 * then the later status, then the path (so the choice never depends on
 * the order a directory was read). The others are removed, and the
 * survivor is put where its status belongs by the folder reconciler
 * (`proposal_reconcile_folder`'s repair), not by a second mover.
 */
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { compareCodeUnits } from '@delendai/state';

import { LAST_TRANSITION_AT_FIELD } from '../contracts/constants/transition-duration.constant';
import type { IProposalStatus } from '../contracts/constants/proposal-glossary.constant';
import { STATUS_PROGRESS } from '../contracts/constants/status-progress.constant';
import type { IProposalCopy } from '../contracts/interfaces/proposal-copy.interface';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import {
	findDuplicateProposalIds,
	reconcileFolders,
} from './sync-proposal-registry';

const progressOf = (status: string): number =>
	STATUS_PROGRESS[status as IProposalStatus] ?? -1;

const timeOf = (stamp: string): number => {
	const parsed = Date.parse(stamp);
	return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

/** The copy to keep: latest transition, then furthest status, then path. */
export const copyToKeep = (copies: readonly IProposalCopy[]): IProposalCopy => {
	const [first] = [...copies].sort(
		(a, b) =>
			timeOf(b.lastTransitionAt) - timeOf(a.lastTransitionAt) ||
			progressOf(b.status) - progressOf(a.status) ||
			compareCodeUnits(a.path, b.path),
	);
	if (first === undefined) throw new Error('no copy to choose from');
	return first;
};

const readCopy = async (
	proposalsDirAbs: string,
	path: string,
): Promise<IProposalCopy> => {
	const raw = await readFile(join(proposalsDirAbs, path), 'utf8');
	const block = extractYamlBlock(raw);
	const fm = block === null ? {} : parseFrontmatterBlock(block);
	const field = (name: string): string => {
		const value = (fm as Record<string, unknown>)[name];
		return typeof value === 'string' ? value : '';
	};
	return {
		path,
		status: field('status'),
		lastTransitionAt: field(LAST_TRANSITION_AT_FIELD),
	};
};

/**
 * Keep one copy of every duplicated proposal id under `proposalsDirAbs`.
 * Returns what was removed (`from` is the path left, `kept` the survivor)
 * and what the folder reconciler moved; both empty when nothing was twice.
 */
export const reconcileDuplicateProposalIds = async (
	proposalsDirAbs: string,
	gitRunner: IGitRunner = createGitRunner(proposalsDirAbs),
): Promise<{
	readonly removed: ReadonlyArray<{
		readonly id: string;
		readonly from: string;
		readonly kept: string;
	}>;
	readonly moved: ReadonlyArray<{ id: string; from: string; to: string }>;
}> => {
	const groups = await findDuplicateProposalIds(proposalsDirAbs);
	const removed: Array<{ id: string; from: string; kept: string }> = [];
	for (const group of groups) {
		const copies = await Promise.all(
			group.paths.map((path) => readCopy(proposalsDirAbs, path)),
		);
		const keep = copyToKeep(copies);
		for (const copy of copies) {
			if (copy.path === keep.path) continue;
			const abs = join(proposalsDirAbs, copy.path);
			await gitRunner(['rm', '-q', '-f', '--', abs]);
			// Untracked here (or no git): the file must go all the same.
			await rm(abs, { force: true });
			removed.push({ id: group.id, from: copy.path, kept: keep.path });
		}
	}
	if (removed.length === 0) return { removed, moved: [] };
	const { moved } = await reconcileFolders(proposalsDirAbs, gitRunner);
	return { removed, moved };
};
