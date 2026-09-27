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

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

const DONE_PREFIX = 'docs/delendai/proposals/done/';

/** The finished slices of `markdown` that lack an independent approval. */
export const unapprovedSlices = (markdown: string): readonly string[] => {
	// A slice is a `###` block with a Status line; other `###` headings
	// (notes, measurements) are not judged. A proposal with no slices is
	// judged as a whole.
	const statusOf = (block: string) =>
		block
			.match(/^[-*]\s*\*\*Status\*\*:\s*([a-z-]+)/imu)?.[1]
			?.toLowerCase();
	const slices = markdown
		.split(/^### /mu)
		.slice(1)
		.filter((block) => statusOf(block) !== undefined);
	const judged =
		slices.length > 0
			? slices.filter((block) => statusOf(block) === 'done')
			: [markdown];
	return judged.flatMap((block) => {
		const title =
			slices.length > 0 ? (block.split('\n')[0] ?? '').trim() : '';
		const implementer = block
			.match(/^[-*]\s*review-implementer:\s*(\S+)/imu)?.[1]
			?.toLowerCase();
		const approvers = [
			...block.matchAll(/^[-*]\s*review-log:\s*approved by\s+(\S+)/gimu),
		].map((match) => (match[1] ?? '').toLowerCase());
		const independent = approvers.some(
			(approver) => approver.length > 0 && approver !== implementer,
		);
		return independent ? [] : [title.length > 0 ? title : '(the proposal)'];
	});
};

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
	const findings = entered.flatMap((path) => {
		const missing = unapprovedSlices(git(root, ['show', `HEAD:${path}`]));
		return missing.length === 0 ? [] : [{ path, missing }];
	});
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
