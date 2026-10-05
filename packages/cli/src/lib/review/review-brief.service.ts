/**
 * review-brief.service.ts — what a reviewer is handed for one proposal:
 * what to read, and the exact calls that record each verdict.
 */
import { CRITERION_SEPARATOR } from '../../contracts/constants/review-command.constant';
import type {
	IQueueProposal,
	IQueueSlice,
	IUnit,
} from '../../contracts/interfaces/review-queue-view.interface';

/** The approval call, with one `--criterion` per declared criterion. */
const approveCall = (id: string, slice: IQueueSlice, who: string): string =>
	`delendai review approve ${id} ${slice.sliceId} ${who} --commit=${slice.candidates?.[0]?.commit ?? '<sha>'} --validate-exit=<gate exit code> --tests-passing=<n> --tests-total=<n>${(slice.acceptance ?? []).map((criterion) => ` --criterion=${JSON.stringify(`${criterion}${CRITERION_SEPARATOR}<how you verified it>`)}`).join('')} --note="<what you verified>"`;

/** What the reviewer needs to judge one proposal, and how to answer. */
export const briefFor = (
	proposal: IQueueProposal,
	unit: IUnit,
	agent: string,
) => {
	const who = `--agent=${agent} --session=${unit.session}`;
	return {
		proposal: proposal.id,
		file: `${unit.path}/${proposal.file}`,
		read: 'Read the proposal and, for each slice below, what its candidate commit delivered (`git show <commit>`). Run its gate. Judge it on what it delivered.',
		slices: proposal.slices
			.filter((slice) => slice.verdict === 'needs-verdict')
			.map((slice) => ({
				slice: slice.sliceId,
				...(slice.title === undefined ? {} : { title: slice.title }),
				...(slice.implementer === undefined
					? {}
					: { implementer: slice.implementer }),
				...(slice.gate === undefined ? {} : { gate: slice.gate }),
				...(slice.files === undefined ? {} : { files: slice.files }),
				...(slice.acceptance === undefined
					? {}
					: { acceptance: slice.acceptance }),
				commits: (slice.candidates ?? []).map((each) => each.commit),
				approve: approveCall(proposal.id, slice, who),
				changes: `delendai review changes ${proposal.id} ${slice.sliceId} ${who} --note="<what is missing, precisely>"`,
			})),
		cannotJudge: `If you cannot inspect or run it, record no verdict: delendai review release ${proposal.id} ${who} --note="<why>"`,
		afterwards: `delendai review next ${who}`,
	};
};
