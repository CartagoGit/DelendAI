/**
 * backlog-on-disk.ts — how many proposals exist, as opposed to how many
 * the index knows about.
 *
 * `auto_work` reads the index. When the index yields nothing it used to
 * say:
 *
 *   {"state":"idle","reason":"no actionable proposal in the index",
 *    "nextAction":"Create a proposal under the proposals dir and run
 *                  sync_proposals."}
 *
 * Measured in a consumer project holding one `ready` proposal with a
 * pending slice, whose index had simply never been built. An agent that
 * follows that instruction **creates a second proposal for work that
 * already exists** — and a duplicate id is a documented way to freeze
 * this repository's whole index.
 *
 * "There is no work" and "I have not looked properly" are different
 * answers, and only one of them means create something.
 */
import { join } from 'node:path';

import { safeListDir } from '@delendai/core/public';

import { PROPOSAL_MARKDOWN_SUFFIX } from '../contracts/constants/backlog-on-disk.constant';
import type { IBacklogProbe } from '../contracts/interfaces/backlog-on-disk.interface';

/**
 * How many proposal files the proposals directory holds, at any depth —
 * or why that could not be counted.
 *
 * Counts files, never parses them: the question is whether the index is
 * plausibly complete, and a file that fails to parse is still a file the
 * index should have known about — indeed more urgently.
 *
 * Walks through `safeListDir` rather than `readdir`: plugin source may
 * not reach for `node:fs` directly (`lint:effect-boundaries`), and the
 * safe reader answers "the directory is not there" as a value instead of
 * a throw.
 *
 * It used to count a directory it could not read as zero. That count
 * chooses between "the index is behind, sync it" and "there is no work,
 * create a proposal", so an unreadable directory could send an agent to
 * write a second proposal for work that already exists. A missing root
 * is a real empty backlog; any directory that exists but cannot be read
 * makes the answer `unreadable`.
 */
export const probeProposalsOnDisk = async (
	proposalsDirAbs: string,
): Promise<IBacklogProbe> => {
	let count = 0;
	const pending: string[] = [proposalsDirAbs];
	let first = true;
	while (pending.length > 0) {
		const dir = pending.pop();
		if (dir === undefined) break;
		const listed = await safeListDir(dir);
		if (first && listed.reason === 'directory-does-not-exist') {
			return { status: 'missing' };
		}
		first = false;
		if (listed.readFailed || listed.reason === 'not-a-directory') {
			return {
				status: 'unreadable',
				dir,
				reason:
					listed.error instanceof Error
						? listed.error.message
						: (listed.reason ??
							'the directory could not be listed'),
			};
		}
		for (const entry of listed.entries) {
			if (entry.isDirectory()) {
				pending.push(join(dir, entry.name));
				continue;
			}
			if (
				entry.isFile() &&
				entry.name.endsWith(PROPOSAL_MARKDOWN_SUFFIX)
			) {
				count += 1;
			}
		}
	}
	return { status: 'ok', count };
};
