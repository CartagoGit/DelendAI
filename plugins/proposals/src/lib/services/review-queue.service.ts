/**
 * review-queue.service.ts — everything a reviewer needs to work through
 * the proposals waiting in review, in one read (x00646).
 *
 * An agent told "review the proposals in review" used to have to find
 * them itself, open each one, work out which slices still needed a
 * verdict, guess which commit delivered each slice, and discover the
 * hard way that a slice with no round could not be reviewed at all. The
 * queue answers all of that from the proposals and from Git, the same
 * way in any project: the delivering commits are found through the
 * project's own ref shape, and every slice comes with the exact call
 * that settles it — or the datum that blocks it.
 *
 * Read-only by construction: it never opens a round, never records a
 * verdict, never moves a file.
 */
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IBuildReviewQueueInput,
	IDeliveryCandidate,
	IReviewQueue,
	IReviewQueueProposal,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';
import { parseReviewState } from '../swarm/proposal-review';
import { readShippingCommit } from '../swarm/slice-shipping-record';
import {
	attributeDelivery,
	listShippedIn,
	type IReviewAttribution,
} from './review-attribution';
import {
	citingRecords,
	indexDeliveries,
	readIntegrationHistory,
	unitKey,
	type IIntegrationRecord,
} from './delivery-history.service';

export type {
	IBuildReviewQueueInput,
	IDeliveryCandidate,
	IReviewQueue,
	IReviewQueueProposal,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';

const SLICE_BLOCK_RE =
	/^### (\S+)\s+—\s+(.+)$([\s\S]*?)(?=^### |^## (?!#)|\n*$(?![\s\S]))/gmu;
const STATUS_LINE_RE = /^[-*]\s*(?:\*\*Status\*\*|status):\s*(.+)$/imu;

const readText = async (path: string): Promise<string | undefined> =>
	new SafeWorkspaceReader(dirname(path))
		.readText(basename(path))
		.then((value) => value.content)
		.catch(() => undefined);

interface IIndexEntry {
	readonly id: string;
	readonly file: string;
	readonly status?: string;
	readonly date?: string;
}

const proposalsInReview = async (
	indexPathAbs: string,
): Promise<readonly IIndexEntry[]> => {
	const raw = await readText(indexPathAbs);
	if (raw === undefined) return [];
	const parsed = JSON.parse(raw) as { proposals?: IIndexEntry[] };
	return (parsed.proposals ?? [])
		.filter((entry) => entry.status === 'review')
		.sort(
			(left, right) =>
				(left.date ?? '').localeCompare(right.date ?? '') ||
				left.id.localeCompare(right.id),
		);
};

const dedupe = (
	candidates: readonly IDeliveryCandidate[],
): readonly IDeliveryCandidate[] => {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = candidate.commit.toLowerCase().slice(0, 7);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const reviewCall = (
	prefix: string,
	proposalId: string,
	sliceId: string,
	implementer: string | undefined,
	commit: string | undefined,
): string => {
	const who =
		implementer === undefined ? '<you>' : `<you — not ${implementer}>`;
	const hash = commit ?? '<delivering commit>';
	return (
		`Read the diff of ${hash}, run the slice gate and check every acceptance item; do not edit code. ` +
		`Then ${prefix}_proposal_review { proposalId: "${proposalId}", sliceId: "${sliceId}", action: "approve", agent: "${who}", note: "<what you verified and how>", evidence: { commitHash: "${hash}", validateExitCode: 0, testsPassing: <n>, testsTotal: <n> } } ` +
		`— or action: "request_changes", commitHash: "${hash}", note: "<what is wrong, where, how to reproduce, what must hold to approve>".`
	);
};

const settleSlice = async (
	input: IBuildReviewQueueInput,
	proposalId: string,
	slice: {
		readonly sliceId: string;
		readonly title: string;
		readonly block: string;
		readonly files: readonly string[];
		readonly gate?: string | undefined;
		readonly acceptance: readonly string[];
	},
	candidates: readonly IDeliveryCandidate[],
): Promise<IReviewQueueSlice> => {
	const state = parseReviewState(slice.block);
	const later = await changedSince(input, candidates[0]?.commit, slice.files);
	const base = {
		sliceId: slice.sliceId,
		title: slice.title,
		status: STATUS_LINE_RE.exec(slice.block)?.[1]?.trim() ?? 'pending',
		reviewState: state.status,
		candidates,
		files: slice.files,
		acceptance: slice.acceptance,
		...(slice.gate === undefined ? {} : { gate: slice.gate }),
		...(later.length === 0 ? {} : { changedSince: later }),
	};
	const prefix = input.namespacePrefix;
	if (state.status === 'done') {
		return {
			...base,
			...(state.implementer === null
				? {}
				: {
						implementer: state.implementer,
						implementerSource: 'round',
					}),
			verdict: 'approved',
			nextAction: 'Nothing left for a reviewer on this slice.',
		};
	}
	if (state.status === 'changes_requested') {
		return {
			...base,
			...(state.implementer === null
				? {}
				: {
						implementer: state.implementer,
						implementerSource: 'round',
					}),
			verdict: 'waiting-on-implementer',
			nextAction:
				'Changes were requested; the implementer resubmits the fix, then a reviewer other than the last one verifies it.',
		};
	}
	if (state.status === 'in_review' && state.implementer !== null) {
		return {
			...base,
			implementer: state.implementer,
			implementerSource: 'round',
			verdict: 'needs-verdict',
			nextAction: reviewCall(
				prefix,
				proposalId,
				slice.sliceId,
				state.implementer,
				candidates[0]?.commit,
			),
		};
	}
	// No round was ever opened: the implementer has to come from Git.
	// A candidate that names its author wins over one nobody signed; an
	// unsigned delivery still gets a verdict, under the unrecorded name.
	// When no candidate is this slice's at all, report the most telling
	// failure.
	const rank = { unrelated: 1, unusable: 0 } as const;
	let best: { rank: number; missing: string } = {
		rank: -1,
		missing: `the commit that delivered ${proposalId} ${slice.sliceId}: record it on the slice as \`- shipped-in: <sha>\`, or name it as commitHash in the verdict`,
	};
	let unsigned: IReviewAttribution | undefined;
	for (const candidate of candidates) {
		const derived = await attributeDelivery({
			run: input.run,
			proposalId,
			declaredFiles: slice.files,
			commitHash: candidate.commit,
			integration: input.integration,
			refShape: input.refShape,
		});
		if (derived.ok && derived.attribution.recorded) {
			return attributed(
				base,
				prefix,
				proposalId,
				slice.sliceId,
				derived.attribution,
			);
		}
		if (derived.ok) unsigned ??= derived.attribution;
		else if (rank[derived.kind] > best.rank) {
			best = { rank: rank[derived.kind], missing: derived.missing };
		}
	}
	if (unsigned !== undefined) {
		return attributed(base, prefix, proposalId, slice.sliceId, unsigned);
	}
	const missing = best.missing;
	return {
		...base,
		verdict: 'blocked',
		missing,
		nextAction: `No approval can be recorded yet: supply ${missing}. If the work was never delivered, send it back with ${prefix}_proposal_review { proposalId: "${proposalId}", sliceId: "${slice.sliceId}", action: "request_changes", agent: "<you>", note: "<what is missing>" } — no commit is needed for that. Do not submit on the implementer's behalf.`,
	};
};

/** A slice whose delivery Git attributed — to a name, or to nobody. */
const attributed = (
	base: Omit<IReviewQueueSlice, 'verdict' | 'nextAction'>,
	prefix: string,
	proposalId: string,
	sliceId: string,
	attribution: IReviewAttribution,
): IReviewQueueSlice => ({
	...base,
	implementer: attribution.implementer,
	implementerSource: attribution.recorded ? 'git' : 'unrecorded',
	verdict: 'needs-verdict',
	nextAction: `${
		attribution.recorded
			? ''
			: 'Nothing in Git names who delivered this; it is reviewed as unrecorded and independence cannot be verified. '
	}${reviewCall(
		prefix,
		proposalId,
		sliceId,
		attribution.recorded ? attribution.implementer : undefined,
		attribution.commit,
	)}`,
});

const reviewProposal = async (
	input: IBuildReviewQueueInput,
	entry: IIndexEntry,
	deliveries: ReadonlyMap<string, readonly IDeliveryCandidate[]>,
	history: readonly IIntegrationRecord[],
): Promise<IReviewQueueProposal | undefined> => {
	const markdown = await readText(join(input.proposalsDirAbs, entry.file));
	if (markdown === undefined) return undefined;
	const plan = parseProposalSlicePlan(entry.id, markdown);
	const blocks = new Map<string, { title: string; block: string }>();
	for (const match of markdown.matchAll(SLICE_BLOCK_RE)) {
		blocks.set((match[1] ?? '').toLowerCase(), {
			title: (match[2] ?? '').trim(),
			block: match[3] ?? '',
		});
	}
	const shippedIn = listShippedIn(markdown).map((commit) => ({
		commit,
		source: 'frontmatter shipped-in',
	}));
	const citing = citingRecords(history, entry.id);
	const slices: IReviewQueueSlice[] = [];
	for (const slice of plan?.slices ?? []) {
		const found = blocks.get(slice.sliceId.toLowerCase());
		const block = found?.block ?? '';
		const recorded = readShippingCommit(block);
		const candidates = dedupe([
			...(recorded === undefined
				? []
				: [{ commit: recorded, source: 'slice shipped-in' }]),
			...(deliveries.get(unitKey(entry.id, slice.sliceId)) ?? []),
			...shippedIn,
			...citing,
		]);
		slices.push(
			await settleSlice(
				input,
				entry.id,
				{
					sliceId: slice.sliceId,
					title: found?.title ?? slice.title,
					block,
					files: slice.files,
					gate: slice.gate,
					acceptance: slice.acceptanceCriteria,
				},
				candidates,
			),
		);
	}
	const closable =
		slices.length > 0 &&
		slices.every((slice) => slice.verdict === 'approved');
	return {
		id: entry.id,
		file: entry.file,
		...(entry.date === undefined ? {} : { date: entry.date }),
		slices,
		...(closable
			? {
					close: `${input.namespacePrefix}_proposal_transition { id: "${entry.id}", to: "done", reason: "every slice independently approved" } — if it is refused, the refusal names what is missing.`,
				}
			: {}),
	};
};

/** The most later commits named per slice. */
const CHANGED_SINCE_LIMIT = 10;

/**
 * What the integration branch did to a slice's files after the slice was
 * delivered. Reviewed months later, a slice whose work a later proposal
 * changed or reverted looked incomplete against today's code; it was
 * not. Globs are passed as git glob pathspecs.
 */
const changedSince = async (
	input: IBuildReviewQueueInput,
	commit: string | undefined,
	files: readonly string[],
): Promise<
	readonly { readonly commit: string; readonly subject: string }[]
> => {
	if (commit === undefined || files.length === 0) return [];
	const specs = files.map((file) =>
		file.includes('*') ? `:(glob)${file}` : file,
	);
	const log = await input.run([
		'log',
		'--no-merges',
		`--max-count=${String(CHANGED_SINCE_LIMIT)}`,
		'--format=%h%x09%s',
		`${commit}..${input.integration}`,
		'--',
		...specs,
	]);
	if (!log.ok) return [];
	return log.output
		.split('\n')
		.map((line) => line.split('\t'))
		.filter(([sha]) => sha !== undefined && sha.length > 0)
		.map(([sha, ...subject]) => ({
			commit: sha ?? '',
			subject: subject.join('\t'),
		}));
};

const procedureFor = (prefix: string): string =>
	'For each slice marked needs-verdict: read the diff of the delivering commit, run its gate, and check every acceptance item and the proposal non-goals against what that commit delivered; look for regressions and out-of-scope changes. ' +
	'A slice is judged on what it delivered, not on today’s code: if the code differs now and `changedSince` names a later commit that changed it (another proposal superseding, extending or reverting it), that is not a defect of this slice — approve on the delivered state and name those commits in the note. Request changes only for what the delivery itself got wrong. ' +
	`Record the verdict with ${prefix}_proposal_review only — approve with evidence, or request_changes with a note that says what is wrong, where, how to reproduce it and what must hold to approve. ` +
	'A delivery nobody signed is reviewed as unrecorded: independence cannot be verified, so say exactly what you checked. Never edit code, never submit on the implementer’s behalf, never move a proposal by hand. A blocked slice is reported with its missing datum and skipped; a proposal whose slices are all approved is closed with the call in its `close` field. ' +
	'Work oldest first and do not stop at the first finding: every proposal in review gets a verdict or a stated blocker.';

/** The review backlog, oldest first, each slice with the call that settles it. */
export const buildReviewQueue = async (
	input: IBuildReviewQueueInput,
): Promise<IReviewQueue> => {
	const entries = (await proposalsInReview(input.indexPathAbs)).filter(
		(entry) =>
			input.proposalId === undefined ||
			entry.id.toLowerCase() === input.proposalId.toLowerCase(),
	);
	const history = await readIntegrationHistory(input.run, input.integration);
	const deliveries =
		input.refShape === undefined
			? new Map<string, readonly IDeliveryCandidate[]>()
			: indexDeliveries(history, input.refShape);
	const reviewed: IReviewQueueProposal[] = [];
	for (const entry of entries) {
		const proposal = await reviewProposal(
			input,
			entry,
			deliveries,
			history,
		);
		if (proposal !== undefined) reviewed.push(proposal);
	}
	const slices = reviewed.flatMap((proposal) => proposal.slices);
	const count = (verdict: IReviewQueueSlice['verdict']): number =>
		slices.filter((slice) => slice.verdict === verdict).length;
	return {
		proposals: reviewed.slice(0, input.limit),
		totals: {
			proposals: reviewed.length,
			slices: slices.length,
			needsVerdict: count('needs-verdict'),
			blocked: count('blocked'),
			waitingOnImplementer: count('waiting-on-implementer'),
			readyToClose: reviewed.filter(
				(proposal) => proposal.close !== undefined,
			).length,
		},
		procedure: procedureFor(input.namespacePrefix),
	};
};
