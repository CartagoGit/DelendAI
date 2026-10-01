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

/**
 * A GitHub remote, with the host anchored: `https://github.com/…`,
 * `ssh://git@github.com/…` or `git@github.com:…`, and not a host that
 * merely ends in `github.com`.
 */
const GITHUB_REMOTE =
	/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/:]+@)github\.com[:/]/u;

export const pullRequestText = (
	subjects: readonly string[],
	branch: string,
	fallback: string,
): { readonly title: string; readonly body: string } => {
	const oldestFirst = [...subjects].reverse();
	const meaningful = oldestFirst.filter((subject) => !isBookkeeping(subject));
	const title =
		meaningful.find((subject) => DELIVERY.test(subject)) ??
		meaningful[0] ??
		fallback;
	const listed = oldestFirst
		.filter((subject) => !subject.startsWith('Merge '))
		.map((subject) => `- ${subject}`)
		.join('\n');
	return {
		title,
		body: `Opened by \`delendai work publish\` for \`${branch}\`.\n\n${listed}`,
	};
};

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
		return { status: 'existing', url: existing };
	}
	const subjects = (
		ports.git([
			'log',
			'--no-merges',
			'--format=%s',
			`${input.integrationBase}..${input.tip}`,
		]) ?? ''
	)
		.split('\n')
		.filter((line) => line.length > 0);
	const text = pullRequestText(subjects, input.branch, input.fallbackTitle);
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
	return created === undefined || created === ''
		? {
				status: 'failed',
				reason: `\`gh pr create\` did not open it; \`${input.branch}\` stays published, and the owner machine opens its pull request into \`${input.base}\` after the next merge.`,
			}
		: { status: 'opened', url: created };
};
