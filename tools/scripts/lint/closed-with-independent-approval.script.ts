#!/usr/bin/env bun
/**
 * closed-with-independent-approval.script.ts — a proposal a pull request
 * closes carries, for every finished slice, an approval by someone other
 * than its implementer (x00696).
 *
 * Closing is the one step the review swarm exists for. On 2026-09-27
 * reviewer agents closed about 200 proposals in four pull requests
 * without it: `proposal_force_transition … skipPeerReview: true`
 * (described as needing "host approval", which nothing checked), 74
 * proposals "pending review", and a raised lint baseline to let one
 * through. Every refusal inside the tools can be routed around by a tool
 * that skips it; the one step no agent performs is a merge the queue will
 * not arm. So this runs in CI: a pull request that moves a proposal into
 * `done/` without an independent approval is red, the queue leaves it,
 * and the owner decides.
 *
 * Only proposals the pull request moves into `done/` are judged; the
 * history already there is not.
 *
 *   bun tools/scripts/lint/closed-with-independent-approval.script.ts [--base=<ref>]
 */
import { execFileSync } from 'node:child_process';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	type IReviewIndependence,
	unapprovedSlices,
} from '@delendai/proposals/public';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

const DONE_PREFIX = 'docs/delendai/proposals/done/';

// The rule lives in the proposals plugin, the same one every path to
// `done` applies (x00718).
export { unapprovedSlices } from '@delendai/proposals/public';

/**
 * The project's review policy, read where the proposals plugin reads it:
 * CI judges with the same rule the tools apply (x00718).
 */
const reviewPolicyOf = (
	root: string,
): {
	readonly requirePeerReview: boolean;
	readonly reviewIndependence: IReviewIndependence;
} => {
	let options: Record<string, unknown> = {};
	try {
		const config = JSON.parse(
			readFileSync(join(root, 'delendai.config.json'), 'utf8'),
		) as {
			plugins?: { proposals?: { options?: Record<string, unknown> } };
		};
		options = config.plugins?.proposals?.options ?? {};
	} catch {
		// No config: the plugin's defaults.
	}
	return {
		requirePeerReview: options.requirePeerReview !== false,
		reviewIndependence:
			options.reviewIndependence === 'model' ? 'model' : 'instance',
	};
};

/**
 * The agent a ref belongs to: the segment right after the work-ref or
 * publication prefix (`delendai/pr/<agent>/…`), or `undefined` for a ref
 * outside the agents' namespace, a person's own branch.
 */
export const agentOfRef = (
	ref: string,
	prefixes: readonly string[],
): string | undefined => {
	const name = ref.replace(/^(refs\/)?(heads\/)?/u, '');
	for (const prefix of prefixes) {
		const bare = prefix.replace(/^(refs\/)?(heads\/)?/u, '');
		if (bare.length > 0 && name.startsWith(bare)) {
			const agent = name.slice(bare.length).split('/')[0];
			return agent !== undefined && agent.length > 0 ? agent : undefined;
		}
	}
	return undefined;
};

/**
 * The approvals a diff adds that are not its author's (x00715).
 *
 * `reviewer ≠ implementer` compares names an agent declares. An approval
 * that enters the integration branch through the pull request of its
 * reviewer's own unit ties the declared name to the unit that did the
 * review: approving as someone else then means entering, publishing and
 * approving under that name, and any mismatch between the three is caught
 * here, on every host.
 */
export const approvalsNotBy = (
	unifiedDiff: string,
	author: string,
): readonly string[] =>
	approvalsAdded(unifiedDiff).filter(
		(approver) => approver.toLowerCase() !== author.toLowerCase(),
	);

/** Every approval a unified diff adds, by its approver. */
export const approvalsAdded = (unifiedDiff: string): readonly string[] =>
	unifiedDiff.split('\n').flatMap((line) => {
		const approver = line.match(
			/^\+[-*]\s*review-log:\s*approved by\s+(\S+)/iu,
		)?.[1];
		return approver === undefined ? [] : [approver];
	});

/**
 * The kind of work a ref names: the segment after its agent
 * (`delendai/pr/<agent>/<kind>/…`), or `undefined` for a ref outside the
 * agents' namespace or one written before refs named their kind.
 */
export const kindOfRef = (
	ref: string,
	prefixes: readonly string[],
): string | undefined => {
	const name = ref.replace(/^(refs\/)?(heads\/)?/u, '');
	for (const prefix of prefixes) {
		const bare = prefix.replace(/^(refs\/)?(heads\/)?/u, '');
		if (bare.length === 0 || !name.startsWith(bare)) continue;
		// <agent>/<kind>/<unit>…: a kind is named only when a unit follows.
		const [, kind, unit] = name.slice(bare.length).split('/');
		return kind !== undefined && kind.length > 0 && unit !== undefined
			? kind
			: undefined;
	}
	return undefined;
};

/**
 * The label the owner puts on a pull request to say "reconcile this"
 * (x00743). A `reconcile` unit carries verdicts other reviewers recorded
 * after something went wrong, so its approvals are not its own; only the
 * owner decides that they may enter together. Agents never apply it.
 */
export const OWNER_RECONCILE_LABEL = 'delendai:owner-reconcile';

/** Whether the owner's label is among a pull request's labels. */
export const ownerAuthorizedReconcile = (labels: readonly string[]): boolean =>
	labels.includes(OWNER_RECONCILE_LABEL);

/** The labels in a pull request event payload, and the request's number. */
export const labelsInEvent = (
	eventJson: string | undefined,
): { readonly labels: readonly string[]; readonly number?: number } => {
	if (eventJson === undefined) return { labels: [] };
	try {
		const event = JSON.parse(eventJson) as {
			readonly pull_request?: {
				readonly number?: unknown;
				readonly labels?: readonly { readonly name?: unknown }[];
			};
		};
		const pr = event.pull_request;
		return {
			labels: (pr?.labels ?? []).flatMap((label) =>
				typeof label.name === 'string' ? [label.name] : [],
			),
			...(typeof pr?.number === 'number' ? { number: pr.number } : {}),
		};
	} catch {
		return { labels: [] };
	}
};

/**
 * The pull request's labels as they are NOW. The event payload is frozen
 * at the push that started the run, and re-running a job replays it: the
 * owner labels, re-runs the failed job, and this reads the label live.
 * Outside CI there is no pull request, and nothing is authorized.
 */
const pullRequestLabels = async (): Promise<readonly string[]> => {
	const path = process.env.GITHUB_EVENT_PATH;
	let eventJson: string | undefined;
	try {
		eventJson =
			path === undefined || path.length === 0
				? undefined
				: readFileSync(path, 'utf8');
	} catch {
		eventJson = undefined;
	}
	const fromEvent = labelsInEvent(eventJson);
	const repository = process.env.GITHUB_REPOSITORY;
	const token = process.env.GH_TOKEN;
	if (
		fromEvent.number === undefined ||
		repository === undefined ||
		token === undefined
	) {
		return fromEvent.labels;
	}
	try {
		const response = await fetch(
			`https://api.github.com/repos/${repository}/issues/${String(fromEvent.number)}/labels`,
			{
				headers: {
					authorization: `Bearer ${token}`,
					accept: 'application/vnd.github+json',
				},
			},
		);
		if (!response.ok) return fromEvent.labels;
		const live = (await response.json()) as readonly { name?: unknown }[];
		return [
			...fromEvent.labels,
			...live.flatMap((label) =>
				typeof label.name === 'string' ? [label.name] : [],
			),
		];
	} catch {
		return fromEvent.labels;
	}
};

/**
 * The proposals a review pack changes without having claimed them.
 *
 * A pack is its reviewer's verdicts on the proposals it took. One pull
 * request of a swarm described twenty verdicts and two moves and carried
 * the edits of three other packs: nothing in it said which were its
 * author's, so nothing could be checked against what it claimed.
 * `changedPaths` are the proposal documents the pack touches, and
 * `claimed` the ids of the `Claims` trailers of its own commits.
 */
export const unclaimedProposals = (
	changedPaths: readonly string[],
	claimed: readonly string[],
): readonly string[] => {
	const mine = new Set(claimed.map((id) => id.trim().toLowerCase()));
	return [
		...new Set(
			changedPaths
				.map((path) =>
					/^([a-z]\d{5})-/iu
						.exec(path.split('/').at(-1) ?? '')?.[1]
						?.toLowerCase(),
				)
				.filter(
					(id): id is string => id !== undefined && !mine.has(id),
				),
		),
	].sort();
};

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd: root, encoding: 'utf8' }).trim();

const main = async (): Promise<number> => {
	const root = repoRoot();
	const baseArg = process.argv
		.find((arg) => arg.startsWith('--base='))
		?.slice('--base='.length);
	const base =
		baseArg ??
		git(root, [
			'merge-base',
			'HEAD',
			`refs/remotes/origin/${declaredBranches(root).integration}`,
		]);
	const entered = git(root, [
		'diff',
		'--name-only',
		'--diff-filter=AR',
		base,
		'HEAD',
		'--',
		DONE_PREFIX,
	])
		.split('\n')
		.filter((path) => path.endsWith('.md') && !path.endsWith('README.md'));
	const review = reviewPolicyOf(root);
	if (!review.requirePeerReview) {
		console.log(
			'✓ closed-with-independent-approval: this project does not review proposals (plugins.proposals.options.requirePeerReview: false).',
		);
		return 0;
	}
	const findings = entered.flatMap((path) => {
		const missing = unapprovedSlices(
			git(root, ['show', `HEAD:${path}`]),
			review.reviewIndependence,
		);
		return missing.length === 0 ? [] : [{ path, missing }];
	});
	const head =
		process.env.GITHUB_HEAD_REF ??
		git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
	const branches = declaredBranches(root);
	const author = agentOfRef(head, [
		branches.publicationRefPrefix,
		branches.workRefPrefix,
	]);
	const addedHere = git(root, [
		'diff',
		'-U0',
		'-M',
		base,
		'HEAD',
		'--',
		'docs/delendai/proposals/',
	]);
	const foreign =
		author === undefined ? [] : approvalsNotBy(addedHere, author);
	// An approval is a reviewer's: it enters through a review unit. The
	// implementer's own pull request adding one is the implementer
	// approving itself, whatever the names say, and under
	// `reviewIndependence: instance` the names cannot say (x00729).
	const kind = kindOfRef(head, [
		branches.publicationRefPrefix,
		branches.workRefPrefix,
	]);
	const approvals = approvalsAdded(addedHere);
	// A reconciliation carries other reviewers' approvals, and only the
	// owner's label lets them in; every closed proposal still needs one.
	const authorized =
		kind === 'reconcile' &&
		ownerAuthorizedReconcile(await pullRequestLabels());
	if (kind === 'reconcile' && !authorized && approvals.length > 0) {
		console.error(
			`✖ closed-with-independent-approval: ${head} is a reconciliation, and adds approvals by ${[...new Set(approvals)].join(', ')}. It closes proposals only once the owner labels its pull request \`${OWNER_RECONCILE_LABEL}\`.`,
		);
		return 1;
	}
	if (
		kind !== undefined &&
		kind !== 'review' &&
		!authorized &&
		approvals.length > 0
	) {
		console.error(
			`✖ closed-with-independent-approval: ${head} is ${kind} work, and adds approvals by ${[...new Set(approvals)].join(', ')}. An approval enters through a review unit: \`delendai review next\`.`,
		);
		return 1;
	}
	if (kind === 'review') {
		const unclaimed = unclaimedProposals(
			git(root, [
				'diff',
				'--name-only',
				'--no-renames',
				base,
				'HEAD',
				'--',
				'docs/delendai/proposals/',
			]).split('\n'),
			git(root, [
				'log',
				'--format=%(trailers:key=Claims,valueonly,separator=%x2C)',
				`${base}..HEAD`,
			]).split(/[\n,]/u),
		);
		if (unclaimed.length > 0) {
			console.error(
				`✖ closed-with-independent-approval: ${head} is a review pack, and changes ${unclaimed.join(', ')} without having claimed ${unclaimed.length === 1 ? 'it' : 'them'}. A pack changes the proposals its own commits claim (\`delendai review next\` claims before it reads); what belongs to another pack lands with that pack.`,
			);
			return 1;
		}
	}
	if (foreign.length > 0 && !authorized) {
		console.error(
			`✖ closed-with-independent-approval: ${head} is ${author ?? ''}'s, and adds approvals by ${[...new Set(foreign)].join(', ')}. An approval enters through the pull request of its reviewer's own unit.`,
		);
		return 1;
	}
	if (findings.length === 0) {
		console.log(
			`✓ closed-with-independent-approval: ${String(entered.length)} proposal(s) closed here, each with an independent approval.`,
		);
		return 0;
	}
	console.error(
		`✖ closed-with-independent-approval: ${String(findings.length)} of ${String(entered.length)} proposal(s) closed here lack an approval by someone other than their implementer:`,
	);
	for (const { path, missing } of findings) {
		console.error(`  - ${path}: ${missing.join('; ')}`);
	}
	console.error(
		'  A reviewer approves with `proposal_review { action: "approve" }` (reviewer ≠ implementer) before `proposal_transition` closes. Skipping review is the owner\'s decision: this check stays red and the owner merges by hand.',
	);
	return 1;
};

if (import.meta.main) process.exit(await main());
