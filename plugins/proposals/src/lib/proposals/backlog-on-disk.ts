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

/**
 * How many proposal files the proposals directory holds, at any depth.
 *
 * Counts files, never parses them: the question is whether the index is
 * plausibly complete, and a file that fails to parse is still a file the
 * index should have known about — indeed more urgently.
 *
 * Walks through `safeListDir` rather than `readdir`: plugin source may
 * not reach for `node:fs` directly (`lint:effect-boundaries`), and the
 * safe reader is the mechanism that exists for exactly this — it
 * answers "the directory is not there" as a value instead of a throw,
 * which is the case this function most needs to get right.
 */
export const countProposalsOnDisk = async (
	proposalsDirAbs: string,
): Promise<number> => {
	let count = 0;
	const pending: string[] = [proposalsDirAbs];
	while (pending.length > 0) {
		const dir = pending.pop();
		if (dir === undefined) break;
		// A missing or unreadable directory contributes nothing. No
		// proposals directory is a real answer: there is nothing.
		const { entries } = await safeListDir(dir);
		for (const entry of entries) {
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
	return count;
};
