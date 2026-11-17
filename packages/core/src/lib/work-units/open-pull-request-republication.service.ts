/**
 * open-pull-request-republication.service.ts — publishing again updates
 * the pull request the work is already in (x01085).
 *
 * ROOT CAUSE: the publication name carries the kind and the generation of
 * the unit. Work handed over from a `create` unit and fixed in an
 * `implement` unit was therefore published to a different branch, and
 * `work deliver` opened a second pull request while the first one stayed
 * open, conflicting, and never updated (#2311 and #2354).
 *
 * This is the one place that decides the target ref of a publication.
 * An open pull request of the same agent, proposal and slice (any kind,
 * generation or topic) whose head is an ancestor of the commit being
 * published is updated by a fast-forward push. Any other open pull request
 * of the unit is named in a note, because it is superseded and must be
 * closed or retired. A forge that cannot be read never fails a publication.
 */
import { shortName } from '../integration/decisions/namespaces.helper';
import { landsByPullRequest } from '../development-policy/branch-rules';
import { resolveWorkRef } from '../wip-engine/ref-name';
import type {
	IOpenPullRequest,
	IRepublicationPorts,
	IRepublicationRequest,
	IResolvedPublicationTarget,
} from '../contracts/interfaces/open-pull-request-republication.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { publicationRefFromWorkRef } from './work-publish.service';
import { choosePublicationTarget } from './publication-target.service';

const SLICE_MARK = 'zzslicemarkzz';
const KIND_MARK = 'zzkindmarkzz';
const TOPIC_MARK = 'zztopicmarkzz';
const GENERATION_MARK = 987_654_321;
const OPEN_PULL_REQUEST_LIMIT = '200';

const escapeRegExp = (text: string): string =>
	text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Matches the publication refs of one agent and proposal, whatever their
 * kind, generation and topic. The slice is the first capture group.
 */
export const unitPublicationPattern = (
	policy: IResolvedDevelopmentPolicy,
	unit: { readonly agent: string; readonly proposal: string },
): RegExp | undefined => {
	const marked = publicationRefFromWorkRef(
		policy,
		resolveWorkRef(policy.branches.workRefTemplate, {
			agent: unit.agent,
			kind: KIND_MARK,
			proposal: unit.proposal,
			slice: SLICE_MARK,
			generation: GENERATION_MARK,
			topic: TOPIC_MARK,
		}),
	);
	if (marked === undefined) return undefined;
	const source = escapeRegExp(shortName(marked))
		.replace(SLICE_MARK, '([^/]+?)')
		.replace(KIND_MARK, '[^/]+')
		.replace(String(GENERATION_MARK), '\\d+')
		.replace(TOPIC_MARK, '[^/]+');
	return new RegExp(`^${source}$`, 'u');
};

const isOpenPullRequest = (value: unknown): value is IOpenPullRequest => {
	const candidate = value as Partial<IOpenPullRequest> | null;
	return (
		typeof candidate?.number === 'number' &&
		typeof candidate.headRefName === 'string' &&
		typeof candidate.headRefOid === 'string'
	);
};

/** The open pull requests, or `undefined` when the forge cannot be read. */
const readOpenPullRequests = (
	ports: IRepublicationPorts,
): readonly IOpenPullRequest[] | undefined => {
	const listed = ports.gh([
		'pr',
		'list',
		'--state',
		'open',
		'--limit',
		OPEN_PULL_REQUEST_LIMIT,
		'--json',
		'number,headRefName,headRefOid',
	]);
	if (listed === undefined || listed === '') return undefined;
	try {
		const parsed: unknown = JSON.parse(listed);
		return Array.isArray(parsed)
			? parsed.filter(isOpenPullRequest)
			: undefined;
	} catch {
		return undefined;
	}
};

/** Whether `head` is contained in `tip`, fetching the head when it is not local. */
const headIsAncestor = (
	ports: IRepublicationPorts,
	remote: string,
	candidate: IOpenPullRequest,
	tip: string,
): boolean => {
	const local = (): boolean =>
		ports.git(['cat-file', '-e', `${candidate.headRefOid}^{commit}`]) !==
		undefined;
	if (!local()) {
		ports.git([
			'fetch',
			'--quiet',
			'--',
			remote,
			`refs/heads/${candidate.headRefName}`,
		]);
	}
	return (
		local() &&
		ports.git([
			'merge-base',
			'--is-ancestor',
			candidate.headRefOid,
			tip,
		]) !== undefined
	);
};

const supersededNote = (candidate: IOpenPullRequest): string =>
	`#${String(candidate.number)} (${candidate.headRefName}) is open for this work and is superseded by this publication: close or retire it.`;

const SKIPPED_NOTE =
	'the open pull requests could not be read, so the check for an earlier pull request of this work was skipped.';

/**
 * Where `request`'s work is published: the policy's choice, or the open
 * pull request of the same agent, proposal and slice that it extends.
 */
export const resolvePublicationTarget = (
	request: IRepublicationRequest,
	ports: IRepublicationPorts,
	choose: typeof choosePublicationTarget = choosePublicationTarget,
): IResolvedPublicationTarget | { readonly refusal: string } => {
	const chosen = choose(request);
	if ('refusal' in chosen) return chosen;
	const unchanged: IResolvedPublicationTarget = { ...chosen, notes: [] };
	const { policy, agent, proposal, remote } = request;
	if (!landsByPullRequest(policy)) return unchanged;
	const pattern = unitPublicationPattern(policy, { agent, proposal });
	const chosenName = shortName(chosen.publicationRef);
	const slice = pattern?.exec(chosenName)?.[1];
	const tip = ports.git(['rev-parse', '-q', '--verify', request.workRef]);
	if (pattern === undefined || slice === undefined || tip === undefined) {
		return unchanged;
	}
	const open = readOpenPullRequests(ports);
	if (open === undefined) return { ...unchanged, notes: [SKIPPED_NOTE] };
	const mine = open
		.filter(
			(candidate) =>
				candidate.headRefName !== chosenName &&
				pattern.exec(candidate.headRefName)?.[1] === slice,
		)
		.sort((first, second) => second.number - first.number);
	const joined = mine.find((candidate) =>
		headIsAncestor(ports, remote, candidate, tip),
	);
	const left = mine.filter((candidate) => candidate !== joined);
	const notes = left.map(supersededNote);
	if (joined === undefined) return { ...unchanged, notes };
	return {
		...chosen,
		publicationRef: `refs/heads/${joined.headRefName}`,
		reason: `#${String(joined.number)} is open for ${proposal} ${slice}, and its head is contained in this work; this publication updates it`,
		pullRequestNumber: joined.number,
		notes,
	};
};
