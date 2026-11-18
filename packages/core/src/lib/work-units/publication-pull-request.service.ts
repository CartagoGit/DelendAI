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
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { landsByPullRequest } from '../development-policy/branch-rules';
import { pullRequestPorts } from './change-request-forges.service';
import { pullRequestText } from './pull-request-text.service';
import { urgentReasonOfBody } from './pull-request-urgency.service';
import type { IChangeRequestRef } from '../contracts/interfaces/change-request-forge.interface';
import type {
	IPublicationPullRequest,
	IPullRequestPorts,
} from '../contracts/interfaces/publication-pull-request.interface';

/** The text of a publication's pull request is the template's. */
export { pullRequestText };

/**
 * A GitHub remote, with the host anchored: `https://github.com/…`,
 * `ssh://git@github.com/…` or `git@github.com:…`, and not a host that
 * merely ends in `github.com`.
 */
const GITHUB_REMOTE =
	/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/:]+@)github\.com[:/]/u;

/** The number a pull request URL ends in (`…/pull/12`). */
const NUMBER_OF_URL = /\/(?<number>\d+)\/?$/u;

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
	const current = forge.read(ports.run, ref);
	// A republish keeps the mark the pull request already carries.
	const urgent = input.urgent ?? urgentReasonOfBody(current?.body);
	const text = pullRequestText(
		subjects,
		input.branch,
		input.fallbackTitle,
		urgent,
		changedFiles(input),
	);
	const next = { title: text.title, body: text.body };
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

const changedFiles = (input: IOpenInput): readonly string[] =>
	(
		input.ports.git([
			'diff',
			'--name-only',
			`${input.integrationBase}...${input.tip}`,
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
	/** Why the delivery is urgent, carried onto the pull request's body. */
	readonly urgent?: string | undefined;
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
		input.urgent,
		changedFiles(input),
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

/**
 * The publication of a unit as a pull request, when its branch takes them
 * and the caller did not say otherwise (`--no-pull-request`).
 */
export const openUnitPullRequest = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly args: readonly string[];
	readonly remote: string;
	readonly publicationRef: string;
	readonly tip: string;
	readonly integrationBase: string;
	readonly fallbackTitle: string;
	readonly urgent?: string | undefined;
	/** What git and the forges answer; the real ones when not given. */
	readonly ports?: IPullRequestPorts | undefined;
}): Promise<IPublicationPullRequest | undefined> => {
	if (
		!landsByPullRequest(input.policy) ||
		input.args.includes('--no-pull-request')
	) {
		return undefined;
	}
	return openPublicationPullRequest({
		remote: input.remote,
		base: input.policy.branches.integration,
		branch: input.publicationRef.replace(/^refs\/heads\//u, ''),
		tip: input.tip,
		integrationBase: input.integrationBase,
		fallbackTitle: input.fallbackTitle,
		urgent: input.urgent,
		ports: input.ports ?? (await pullRequestPorts(input.root)),
	});
};
