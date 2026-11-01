import { carriedFrom } from '../../services/carried-work.service';
import { readLeaseOf } from '@delendai/core/cli';
import { createGitRunner, type IGitRunner } from '../../shared/git-runner';
import { readTextOrNull } from '../../proposals/index-reader';
import {
	parseReviewState,
	reviewTransition,
} from '../../swarm/proposal-review';
import { readShippingCommit } from '../../swarm/slice-shipping-record';
import type { IAuthoringToolOptions } from '../authoring-options';
import { sliceIdPattern } from './slice-block.tool';

/**
 * Whether the review rules refuse this verdict on the slice as the
 * document has it now. Read-only: it decides only whether the proposal is
 * claimed before the verdict is recorded.
 */
export const verdictWouldBeRefused = async (
	docPath: string,
	args: {
		readonly sliceId: string;
		readonly action: 'approve' | 'request_changes';
		readonly agent: string;
	},
	quorum: number,
): Promise<boolean> => {
	const md = await readTextOrNull(docPath);
	if (md === null) return false;
	const block = md.match(
		new RegExp(
			`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
			'm',
		),
	);
	if (block === null) return false;
	const state = parseReviewState(block[2] ?? '');
	// With no round open the verdict opens one, which the path below
	// decides; only a round already open has rules to break.
	if (state.status === 'none') return false;
	return !reviewTransition(
		state,
		args.action,
		args.agent,
		'',
		args.action === 'approve'
			? { enforceDistinctAgentName: false, quorum }
			: { quorum },
	).ok;
};

/**
 * `proposal_review` — peer-review loop for a slice. An implementer
 * `submit`s a finished slice for review (it is NOT done yet); a DIFFERENT
 * agent `approve`s it (→ done + lock released) or `request_changes` with an
 * objection (→ reworkable, lock released). The fixer re-`submit`s and another
 * agent reviews the fix — the loop repeats until a reviewer has no objection.
 * `status` reads the current review state without changing it.
 */
/** The Git author, name and email, of the commit a slice cites as shipped. */
export const deliveringAuthorOf = async (
	root: string,
	markdown: string,
	sliceId: string,
): Promise<readonly string[]> => {
	const block = new RegExp(
		`^### ${sliceIdPattern(sliceId)}\\s+—[^\\n]*\\n([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
		'm',
	).exec(markdown)?.[1];
	const commit = block === undefined ? undefined : readShippingCommit(block);
	if (commit === undefined) return [];
	const shown = await createGitRunner(root)([
		'log',
		'-1',
		'--format=%an%x00%ae',
		commit,
	]);
	return shown.ok
		? shown.output
				.trim()
				.split('\0')
				.filter((each) => each.length > 0)
		: [];
};

/** Who made the work a submission in this unit carries, if not its submitter. */
export const makerOfCarriedWork = async (
	run: IGitRunner,
	root: string,
	branches: NonNullable<
		IAuthoringToolOptions['developmentPolicy']
	>['branches'],
	submitter: string,
): Promise<string | undefined> => {
	const head = await run(['symbolic-ref', '--quiet', '--short', 'HEAD']);
	if (!head.ok) return undefined;
	const lease = await readLeaseOf(root, head.output.trim());
	return carriedFrom(
		run,
		branches,
		branches.integration,
		submitter,
		lease?.enteredAt,
	);
};
