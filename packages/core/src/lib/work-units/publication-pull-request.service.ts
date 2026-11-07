/**
 * publication-pull-request.service.ts — a publication becomes a pull
 * request by itself (x00677).
 *
 * `work publish` pushed the publication ref and stopped, and opening the
 * pull request was left to whoever published. Agents that did not do it
 * left work on the forge that nothing reviewed and nothing merged: nine
 * publication refs of one reviewer and two of another sat there, and
 * every one of them failed `ref-lifecycle` — and with it every pull
 * request's required check. The machine that publishes holds the forge
 * credential, so it opens the pull request, or finds the one already
 * open. It never arms auto-merge: arming is the queue's job.
 */
import type { IChangeRequestRef } from '../contracts/interfaces/change-request-forge.interface';
import type {
	IPublicationPullRequest,
	IPullRequestPorts,
} from '../contracts/interfaces/publication-pull-request.interface';

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
	/proposal_review (?<proposal>[a-z]\d{5,}) \S+ (?:approve|request_changes|submit)\b/iu;

const CLAIM = /^chore\(review\): claim (?<proposal>[a-z]\d{5,})\b/iu;

/**
 * The title of a pack of verdicts, or `undefined` for anything else. A
 * pack has no delivery to be named after, and was titled by whichever of
 * its bookkeeping commits came first: approvals of one proposal went out
 * as "release" of another.
 */
const verdictTitle = (
	subjects: readonly string[],
	branch: string,
): string | undefined => {
	const judged = subjects.flatMap(
		(subject) => VERDICT.exec(subject)?.groups?.proposal ?? [],
	);
	const ids = (list: readonly string[]): string =>
		[...new Set(list.map((id) => id.toLowerCase()))].join(', ');
	if (judged.length > 0) {
		return `review: ${String(judged.length)} verdict(s) on ${ids(judged)}`;
	}
	// A pack of a review unit is never "implement batch" (x01032): before
	// its first verdict it is named for what it has claimed.
	const claimed = subjects.flatMap(
		(subject) => CLAIM.exec(subject)?.groups?.proposal ?? [],
	);
	return branch.includes('/review/') && claimed.length > 0
		? `review: claim(s) on ${ids(claimed)}`
		: undefined;
};

/**
 * A GitHub remote, with the host anchored: `https://github.com/…`,
 * `ssh://git@github.com/…` or `git@github.com:…`, and not a host that
 * merely ends in `github.com`.
 */
const GITHUB_REMOTE =
	/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/:]+@)github\.com[:/]/u;

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

export const pullRequestText = (
	subjects: readonly string[],
	branch: string,
	fallback: string,
): { readonly title: string; readonly body: string } => {
	const oldestFirst = [...subjects].reverse();
	const meaningful = oldestFirst.filter((subject) => !isBookkeeping(subject));
	// One delivery titles its pull request; several are counted, so a
	// pull request of ten slices is not read as its oldest commit alone.
	// The unit's own deliveries come first: another unit's, merged in, are
	// that unit's pull request's to name.
	const delivering = meaningful.filter((subject) => DELIVERY.test(subject));
	const own = delivering.filter((subject) => citesUnitOf(subject, branch));
	const deliveries = own.length > 0 ? own : delivering;
	// A pack of verdicts is named for them even when its reviewer also
	// touched a document: "docs(…): x names y" titled a pack that closed
	// three proposals.
	const verdicts = deliveries.every((subject) => subject.startsWith('docs'))
		? verdictTitle(oldestFirst, branch)
		: undefined;
	const first = verdicts ?? deliveries[0] ?? meaningful[0] ?? fallback;
	const title =
		verdicts === undefined && deliveries.length > 1
			? `${first} (+${String(deliveries.length - 1)} more)`
			: first;
	const listed = oldestFirst
		.filter((subject) => !subject.startsWith('Merge '))
		.map((subject) => `- ${subject}`)
		.join('\n');
	return {
		title,
		body: `Opened by \`delendai work publish\` for \`${branch}\`.\n\n${listed}`,
	};
};

/** The number a pull request URL ends in (`…/pull/12`). */
const NUMBER_OF_URL = /\/(?<number>\d+)\/?$/u;

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

/**
 * A republished pull request says what it ships now (x01023): the title
 * and summary are rewritten from the final diff and the slices the unit
 * carries, by the adapter of the forge that hosts it (a GitHub pull
 * request, a GitLab merge request). A change request whose text already
 * matches is left alone; one no installed adapter can rewrite is reported.
 */
const refreshOpenPullRequest = (
	input: IOpenInput,
	remoteUrl: string,
	ref: IChangeRequestRef,
): IPublicationPullRequest => {
	const { ports } = input;
	const forge = ports.forges?.find((candidate) =>
		candidate.handles(remoteUrl),
	);
	if (forge === undefined || ports.run === undefined) {
		return {
			status: 'unchanged',
			url: ref.url,
			reason: `no installed forge plugin can rewrite the text of a change request on \`${remoteUrl}\` (the \`github\` and \`gitlab\` plugins can); its title and summary stay as they were.`,
		};
	}
	const subjects = subjectsOf(input);
	const text = pullRequestText(subjects, input.branch, input.fallbackTitle);
	const files = (
		ports.git([
			'diff',
			'--name-only',
			`${input.integrationBase}...${input.tip}`,
		]) ?? ''
	)
		.split('\n')
		.filter((line) => line.length > 0);
	const slices = slicesCited(subjects);
	const shipped = [
		...(slices.length === 0 ? [] : [`Ships: ${slices.join(', ')}.`]),
		`Final diff: ${String(files.length)} file(s) changed.`,
		...files.slice(0, 40).map((file) => `- \`${file}\``),
		...(files.length > 40
			? [`- … and ${String(files.length - 40)} more`]
			: []),
	].join('\n');
	const next = { title: text.title, body: `${text.body}\n\n${shipped}` };
	const current = forge.read(ports.run, ref);
	if (current?.title === next.title && current.body === next.body) {
		return { status: 'existing', url: ref.url };
	}
	return forge.update(ports.run, ref, next)
		? { status: 'updated', url: ref.url, title: next.title }
		: {
				status: 'unchanged',
				url: ref.url,
				reason: `the ${forge.id} forge did not accept the new title and summary; they stay as they were.`,
			};
};

const subjectsOf = (input: IOpenInput): readonly string[] =>
	(
		input.ports.git([
			'log',
			'--no-merges',
			'--format=%s',
			`${input.integrationBase}..${input.tip}`,
		]) ?? ''
	)
		.split('\n')
		.filter((line) => line.length > 0);

type IOpenInput = Parameters<typeof openPublicationPullRequest>[0];

/**
 * Find or open the pull request of `branch` into `base`. Only for a
 * GitHub remote with its CLI available; anything else is reported, and
 * the publication itself stands either way.
 */
export const openPublicationPullRequest = (input: {
	readonly remote: string;
	readonly base: string;
	readonly branch: string;
	readonly tip: string;
	readonly integrationBase: string;
	readonly fallbackTitle: string;
	readonly ports: IPullRequestPorts;
}): IPublicationPullRequest => {
	const { ports } = input;
	const url = ports.git(['remote', 'get-url', input.remote]) ?? '';
	if (!GITHUB_REMOTE.test(url)) {
		// Another forge: a change request already open there is refreshed by
		// the adapter that hosts it; opening one stays with the machine that
		// holds the credential.
		const open =
			ports.run === undefined
				? undefined
				: ports.forges
						?.find((candidate) => candidate.handles(url))
						?.findOpen(ports.run, input.branch);
		if (open !== undefined) return refreshOpenPullRequest(input, url, open);
		// Never "open it by hand": a pull request an agent opens is a second
		// author for one publication. The machine holding the forge
		// credential opens it after the next merge (open-publication-prs).
		const seen =
			url === '' ? `its URL could not be read` : `its URL is \`${url}\``;
		return {
			status: 'skipped',
			reason: `\`${input.remote}\` is not recognised as a GitHub remote (${seen}); \`${input.branch}\` stays published, and the machine that holds the forge credential opens its pull request into \`${input.base}\` after the next merge there, so until then it has none.`,
		};
	}
	if (ports.gh(['--version']) === undefined) {
		return {
			status: 'skipped',
			// Never "open it by hand": a pull request an agent opens is a second
			// author for one publication. The machine holding the forge
			// credential opens it after the next merge (open-publication-prs).
			reason: `the \`gh\` CLI is not available here; \`${input.branch}\` stays published, and the machine that holds the forge credential opens its pull request into \`${input.base}\` after the next merge there, so until then it has none.`,
		};
	}
	const existing = ports.gh([
		'pr',
		'list',
		'--head',
		input.branch,
		'--state',
		'open',
		'--json',
		'url',
		'--jq',
		'.[0].url // ""',
	]);
	if (existing !== undefined && existing !== '') {
		const id = NUMBER_OF_URL.exec(existing)?.groups?.number;
		return id === undefined
			? { status: 'existing', url: existing }
			: refreshOpenPullRequest(input, url, { url: existing, id });
	}
	const text = pullRequestText(
		subjectsOf(input),
		input.branch,
		input.fallbackTitle,
	);
	const created = ports.gh([
		'pr',
		'create',
		'--base',
		input.base,
		'--head',
		input.branch,
		'--title',
		text.title,
		'--body',
		text.body,
	]);
	// `gh pr create` lives on the CLI's GraphQL surface, which changes
	// with its version (2.4 still aborts on the deprecated Projects
	// classic fields): it failed and left a branch with no pull request.
	// The REST endpoint is the same on every version, and `{owner}/{repo}`
	// is resolved from the remote.
	const opened =
		created === undefined || created === ''
			? ports.gh([
					'api',
					'-X',
					'POST',
					'repos/{owner}/{repo}/pulls',
					'-f',
					`title=${text.title}`,
					'-f',
					`head=${input.branch}`,
					'-f',
					`base=${input.base}`,
					'-f',
					`body=${text.body}`,
					'--jq',
					'.html_url',
				])
			: created;
	return opened === undefined || opened === ''
		? {
				status: 'failed',
				reason: `\`gh pr create\` did not open it; \`${input.branch}\` stays published, and the owner machine opens its pull request into \`${input.base}\` after the next merge.`,
			}
		: { status: 'opened', url: opened };
};
