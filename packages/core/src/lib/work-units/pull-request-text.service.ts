/**
 * pull-request-text.service.ts — the title and body of a publication's
 * pull request, rendered by the one template (f00809) from what the
 * unit's commits and files say.
 */
import { renderChangeText } from '../change-text/change-text-template.service';
import type {
	IChangeTextProposalKind,
	IChangeTextProposalRef,
	IChangeTextVerdict,
} from '../contracts/interfaces/change-text.interface';
import { urgentLine } from './pull-request-urgency.service';

/** Commits that say what the work is not: claims and hand-offs. */
const BOOKKEEPING =
	/^chore\(review\): claim\b|^docs\(proposals\): .*\bto review$/u;

/**
 * Commits that are not the work either: the record a tool commits for
 * itself, regenerated files, and merges. Pull requests were titled by a
 * tool's record when it was a unit's oldest commit.
 */
const HOUSEKEEPING = /^(?:Merge\b|chore\((?:delendai|generated)\):)/u;

const isBookkeeping = (subject: string): boolean =>
	BOOKKEEPING.test(subject) || HOUSEKEEPING.test(subject);

/** A subject that delivers something rather than tidying around it. */
const DELIVERY =
	/^(?:feat|fix|refactor|perf|test|docs|build|ci|revert)(?:\([^)]*\))?!?:/u;

/** The commit a recorded verdict leaves: which proposal it was on. */
const VERDICT =
	/proposal_review (?<proposal>[a-z]\d{5,}) \S+ (?<action>approve|request_changes|submit)\b/iu;

const CLAIM = /^chore\(review\): claim (?<proposal>[a-z]\d{5,})\b/iu;

/** What a pack of verdicts says of itself: its summary and what it judged. */
interface IVerdictPack {
	readonly summary: string;
	readonly proposals: readonly string[];
	readonly verdicts: readonly IChangeTextVerdict[];
}

const uniqueIds = (list: readonly string[]): string[] => [
	...new Set(list.map((id) => id.toLowerCase())),
];

/**
 * The pack of verdicts, or `undefined` for anything else. A pack has no
 * delivery to be named after, and was titled by whichever of its
 * bookkeeping commits came first: approvals of one proposal went out as
 * "release" of another.
 */
const verdictPack = (
	subjects: readonly string[],
	branch: string,
): IVerdictPack | undefined => {
	const judged = subjects.flatMap((subject) => {
		const found = VERDICT.exec(subject)?.groups;
		return found?.proposal === undefined
			? []
			: [{ proposal: found.proposal, verdict: found.action ?? '' }];
	});
	if (judged.length > 0) {
		const ids = uniqueIds(judged.map((j) => j.proposal));
		return {
			summary: `${String(judged.length)} verdict(s) on ${ids.join(', ')}`,
			proposals: ids,
			verdicts: judged.map((j) => ({
				proposal: j.proposal.toLowerCase(),
				verdict: j.verdict.toLowerCase(),
			})),
		};
	}
	// A pack of a review unit is never "implement batch" (x01032): before
	// its first verdict it is named for what it has claimed.
	const claimed = subjects.flatMap(
		(subject) => CLAIM.exec(subject)?.groups?.proposal ?? [],
	);
	if (!branch.includes('/review/') || claimed.length === 0) return undefined;
	const ids = uniqueIds(claimed);
	return {
		summary: `claim(s) on ${ids.join(', ')}`,
		proposals: ids,
		verdicts: [],
	};
};

/** The proposal and slice a unit's branch names (`…/x00875-S23-g1/…`). */
const UNIT_OF_BRANCH =
	/(?:^|\/)(?<proposal>[a-z]\d{5,})-(?<slice>[^/]+?)-g\d+(?:\/|$)/iu;

/**
 * Whether `subject` cites the unit `branch` names. A unit that merged
 * another unit's publication carries its commits too, and was titled by
 * them when they were the oldest.
 */
const citesUnitOf = (subject: string, branch: string): boolean => {
	const unit = UNIT_OF_BRANCH.exec(branch)?.groups;
	if (unit?.proposal === undefined || unit.slice === undefined) return false;
	const cited = subject.toLowerCase();
	const proposal = unit.proposal.toLowerCase();
	return unit.slice.toLowerCase() === 'all'
		? cited.includes(proposal)
		: cited.includes(`${proposal} ${unit.slice.toLowerCase()}`);
};

/** The type and summary of a delivery subject (`fix(core): x` is fix, x). */
const DELIVERY_PARTS = /^(?<type>[a-z]+)(?:\([^)]*\))?!?:\s*(?<summary>.*)$/u;

const PROPOSAL_KINDS: readonly string[] = [
	'feat',
	'fix',
	'docs',
	'perf',
	'refactor',
	'test',
	'chore',
];

/** The proposal and slice a unit's branch names, in the template's terms. */
const proposalsOfBranch = (branch: string): IChangeTextProposalRef[] => {
	const unit = UNIT_OF_BRANCH.exec(branch)?.groups;
	if (unit?.proposal === undefined) return [];
	const all = unit.slice?.toLowerCase() === 'all';
	return [
		{
			proposal: unit.proposal.toLowerCase(),
			slices: all || unit.slice === undefined ? [] : [unit.slice],
		},
	];
};

/**
 * The title and body of the pull request of a publication: the one
 * template (f00809) rendered from what the unit's commits and files say.
 * Nothing in the commits can pick the type, scope or sections.
 */
export const pullRequestText = (
	subjects: readonly string[],
	branch: string,
	fallback: string,
	urgent?: string,
	files: readonly string[] = [],
): { readonly title: string; readonly body: string } => {
	const oldestFirst = [...subjects].reverse();
	const meaningful = oldestFirst.filter((subject) => !isBookkeeping(subject));
	// The unit's own deliveries come first: another unit's, merged in, are
	// that unit's pull request's to name.
	const delivering = meaningful.filter((subject) => DELIVERY.test(subject));
	const own = delivering.filter((subject) => citesUnitOf(subject, branch));
	const deliveries = own.length > 0 ? own : delivering;
	// A pack of verdicts is named for them even when its reviewer also
	// touched a document.
	const pack = deliveries.every((subject) => subject.startsWith('docs'))
		? verdictPack(oldestFirst, branch)
		: undefined;
	const listed = oldestFirst
		.filter((subject) => !subject.startsWith('Merge '))
		.map((subject) => `- ${subject}`)
		.join('\n');
	const reviewNotes = [
		`Opened by \`delendai work publish\` for \`${branch}\`.`,
		...(urgent === undefined ? [] : [urgentLine(urgent)]),
		listed,
	].join('\n\n');
	if (pack !== undefined) {
		return renderChangeText({
			kind: 'review',
			summary: pack.summary,
			proposals: pack.proposals.map((proposal) => ({ proposal })),
			verdicts: pack.verdicts,
			files,
			reviewNotes,
		});
	}
	const first = deliveries[0] ?? meaningful[0];
	const parts = first === undefined ? undefined : DELIVERY_PARTS.exec(first);
	const type = parts?.groups?.type ?? 'chore';
	const proposalKind: IChangeTextProposalKind = PROPOSAL_KINDS.includes(type)
		? (type as IChangeTextProposalKind)
		: 'chore';
	return renderChangeText({
		kind: 'implement',
		proposalKind,
		summary: parts?.groups?.summary || first || fallback,
		proposals: proposalsOfBranch(branch),
		slicesShipped: slicesCited(subjects),
		files,
		reviewNotes,
	});
};

/**
 * The slices a unit's subjects cite, as `x01023 S1` (x01023-all: the
 * proposal alone), in the order they first appear.
 */
const slicesCited = (subjects: readonly string[]): readonly string[] => [
	...new Set(
		subjects.flatMap(
			(subject) => /\b[a-z]\d{5,} S\d+\b/iu.exec(subject)?.[0] ?? [],
		),
	),
];
