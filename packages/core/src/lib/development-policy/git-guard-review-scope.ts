/**
 * git-guard-review-scope.ts — a review unit judges; it does not change the
 * product.
 *
 * A reviewer's work is verdicts: what it writes lands in the project's
 * documents (the proposals it judges) and in the files generated from them.
 * On 2026-09-28 a reviewer asked to close a pack of proposals patched the
 * CLI instead, adding back the flag that skips peer review, so it could
 * close them without one. Nothing in its unit said a reviewer may not.
 *
 * The rule reads the unit's kind from its ref, so it holds for every
 * process committing on a review ref, whatever host runs it and whether
 * or not it says it is an agent. A change the product needs is a proposal
 * of its own, implemented in an `implement` unit.
 */
import { basename } from 'node:path';

import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitGuardVerdict } from '../contracts/interfaces/git-guard.interface';
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
import { shortName } from './git-guard-namespaces';

/** What a review unit may change: the project's documents, and generated files. */
export const inReviewScope = (path: string, docsDir: string): boolean => {
	const docs = docsDir.replace(/^\.\/+|\/+$/gu, '');
	return (
		(docs.length > 0 && path.startsWith(`${docs}/`)) ||
		basename(path).includes('.generated.')
	);
};

/** True when `branch` is a work ref whose kind is `review`. */
export const isReviewUnitBranch = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): boolean => {
	const work = shortName(policy.branches.workRefPrefix);
	if (work.length === 0 || !branch.startsWith(work)) return false;
	const identity = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
	)?.parse(`refs/heads/${branch}`);
	return identity?.kind === 'review';
};

/** The paths of `paths` a review unit may not change. */
export const outsideReviewScope = (
	paths: readonly string[],
	docsDir: string = DEFAULT_CORE_PATHS.docsDir,
): readonly string[] => paths.filter((path) => !inReviewScope(path, docsDir));

/**
 * A commit on a review unit that changes anything but documents and
 * generated files. A merge brings the integration branch in and is not
 * the reviewer's change.
 */
export const refuseReviewOutsideScope = (
	policy: IResolvedDevelopmentPolicy,
	operation: {
		readonly branch: string | undefined;
		readonly isMerge: boolean;
		readonly paths?: readonly string[] | undefined;
		readonly docsDir?: string | undefined;
	},
): IGitGuardVerdict | undefined => {
	if (operation.isMerge || operation.paths === undefined) return undefined;
	if (operation.branch === undefined) return undefined;
	if (!isReviewUnitBranch(policy, operation.branch)) return undefined;
	const outside = outsideReviewScope(operation.paths, operation.docsDir);
	if (outside.length === 0) return undefined;
	return {
		refused: true,
		reason: `\`${operation.branch}\` is a review unit, and a review records verdicts; it does not change ${outside.map((path) => `\`${path}\``).join(', ')}.`,
		remedy: `Unstage them (\`git restore --staged ${outside.join(' ')}\`). A change the product needs is a proposal of its own, implemented in an \`implement\` unit.`,
	};
};
