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
import { readdir } from 'node:fs/promises';

import { PROPOSAL_MARKDOWN_SUFFIX } from '../contracts/constants/backlog-on-disk.constant';

/**
 * How many proposal files the proposals directory holds, at any depth.
 *
 * Counts files, never parses them: the question is whether the index is
 * plausibly complete, and a file that fails to parse is still a file the
 * index should have known about — indeed more urgently.
 */
export const countProposalsOnDisk = async (
	proposalsDirAbs: string,
): Promise<number> => {
	try {
		const entries = await readdir(proposalsDirAbs, {
			recursive: true,
			withFileTypes: true,
		});
		return entries.filter(
			(entry) =>
				entry.isFile() && entry.name.endsWith(PROPOSAL_MARKDOWN_SUFFIX),
		).length;
	} catch {
		// No proposals directory is a real answer: there is nothing.
		return 0;
	}
};
