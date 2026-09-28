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
			options.reviewIndependence === 'instance' ? 'instance' : 'model',
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
	unifiedDiff.split('\n').flatMap((line) => {
		const approver = line.match(
			/^\+[-*]\s*review-log:\s*approved by\s+(\S+)/iu,
		)?.[1];
		return approver !== undefined &&
			approver.toLowerCase() !== author.toLowerCase()
			? [approver]
			: [];
	});

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd: root, encoding: 'utf8' }).trim();

const main = (): number => {
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
	const foreign =
		author === undefined
			? []
			: approvalsNotBy(
					git(root, [
						'diff',
						'-U0',
						'-M',
						base,
						'HEAD',
						'--',
						'docs/delendai/proposals/',
					]),
					author,
				);
	if (foreign.length > 0) {
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

if (import.meta.main) process.exit(main());
