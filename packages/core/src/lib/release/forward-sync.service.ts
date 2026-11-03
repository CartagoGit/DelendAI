/**
 * forward-sync.service.ts — promotion and follow, by each branch's own
 * route (f00801 S3).
 *
 * A rule may name the branch it is promoted from (`main` from `develop`)
 * and the branch it follows (`develop` follows `main`). A promotion opens
 * by the TARGET branch's route; once it lands, the follower takes in what
 * it brought by its own route. Both decide from ancestry alone, so a
 * rerun with nothing to take does nothing.
 */
import type { IBranchRule } from '../contracts/interfaces/branch-rule.interface';
import type {
	IBranchSyncPorts,
	IBranchSyncResult,
} from '../contracts/interfaces/forward-sync.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { branchRuleFor } from '../development-policy/branch-rules';

/** Brings `source` into `target` by `target`'s route, unless it is already there. */
const takeIn = (
	kind: 'promote' | 'follow',
	rule: IBranchRule,
	target: string,
	source: string,
	ports: IBranchSyncPorts,
): IBranchSyncResult => {
	if (ports.isAncestor(source, target)) {
		return {
			kind,
			target,
			source,
			outcome: 'nothing',
			detail: `\`${target}\` already has everything \`${source}\` has.`,
		};
	}
	if (rule.takesIn === 'pull-request') {
		const opened = ports.openPullRequest(target, source);
		return {
			kind,
			target,
			source,
			outcome: opened.ok ? 'pull-request' : 'failed',
			detail: opened.detail,
		};
	}
	if (rule.takesIn === 'merge') {
		const merged = ports.merge(target, source);
		return {
			kind,
			target,
			source,
			outcome: merged.ok ? 'merged' : 'failed',
			detail: merged.detail,
		};
	}
	return {
		kind,
		target,
		source,
		outcome: 'failed',
		detail: `\`${target}\` takes commits directly: nothing promotes or follows into it by pull request or merge.`,
	};
};

/** Opens the promotion into `branch` from the branch its rule names. */
export const promoteBranch = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	branch: string,
	ports: IBranchSyncPorts,
): IBranchSyncResult => {
	const rule = branchRuleFor(policy.branches.rules, branch);
	if (rule?.promotedFrom === undefined) {
		return {
			kind: 'promote',
			target: branch,
			source: '',
			outcome: 'failed',
			detail: `\`${branch}\` declares no \`promotedFrom\` in \`development.branches.rules\`.`,
		};
	}
	return takeIn('promote', rule, branch, rule.promotedFrom, ports);
};

/** Makes every branch that follows another take in what it has moved on. */
export const followBranches = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	ports: IBranchSyncPorts,
): readonly IBranchSyncResult[] =>
	policy.branches.rules
		.filter(
			(rule) => rule.follows !== undefined && !rule.pattern.includes('*'),
		)
		.map((rule) =>
			takeIn('follow', rule, rule.pattern, rule.follows as string, ports),
		);
