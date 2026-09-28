/**
 * git-guard-review-scope.spec.ts — a review unit records verdicts; a
 * commit on it that changes the product is refused, whoever makes it.
 */
import { describe, expect, it } from 'vitest';

import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import {
	isReviewUnitBranch,
	outsideReviewScope,
} from '@delendai/core/lib/development-policy/git-guard-review-scope';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const REVIEW = 'delendai/wip/glm-5/review/batch-all-g1/pack-a';
const IMPLEMENT = 'delendai/wip/glm-5/implement/x00001-S1-g1/the-work';

const commitOn = (branch: string, paths: readonly string[], isMerge = false) =>
	({
		kind: 'commit',
		branch,
		isMerge,
		inMainWorktree: false,
		paths,
		docsDir: 'docs/delendai',
	}) as const;

const AGENT = { agentMarker: 'AI_AGENT' } as const;
const PERSON = { agentMarker: undefined } as const;

describe('a commit on a review unit', () => {
	it('is refused when it changes the product, for an agent and for anyone', () => {
		const patch = commitOn(REVIEW, [
			'docs/delendai/proposals/review/x00001-a.md',
			'packages/cli/src/commands/groups/proposals.ts',
		]);
		for (const actor of [AGENT, PERSON]) {
			const verdict = judgeGitOperation(policy, patch, actor);
			expect(verdict.refused).toBe(true);
			expect(verdict.reason).toContain(
				'`packages/cli/src/commands/groups/proposals.ts`',
			);
			expect(verdict.reason).not.toContain('x00001-a.md');
			expect(verdict.remedy).toContain('implement');
		}
	});

	it('records verdicts, and what is generated from them', () => {
		const verdicts = commitOn(REVIEW, [
			'docs/delendai/proposals/done/fixes/x00001-a.md',
			'docs/delendai/agent-catalog.generated.json',
			'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts',
		]);
		expect(judgeGitOperation(policy, verdicts, AGENT).refused).toBe(false);
	});

	it('brings the integration branch in by merge', () => {
		const merge = commitOn(REVIEW, ['packages/cli/src/index.ts'], true);
		expect(judgeGitOperation(policy, merge, AGENT).refused).toBe(false);
	});

	it('is judged by the unit kind: an implement unit changes the product', () => {
		const work = commitOn(IMPLEMENT, ['packages/cli/src/index.ts']);
		expect(judgeGitOperation(policy, work, AGENT).refused).toBe(false);
	});
});

describe('the review scope', () => {
	it('reads the kind from the ref', () => {
		expect(isReviewUnitBranch(policy, REVIEW)).toBe(true);
		expect(isReviewUnitBranch(policy, IMPLEMENT)).toBe(false);
		expect(isReviewUnitBranch(policy, 'develop')).toBe(false);
	});

	it('is the declared documents directory', () => {
		expect(
			outsideReviewScope(['notes/x00001.md', 'docs/x00001.md'], 'notes'),
		).toEqual(['docs/x00001.md']);
		expect(outsideReviewScope(['docs/delendai/a.md'])).toEqual([]);
	});
});
