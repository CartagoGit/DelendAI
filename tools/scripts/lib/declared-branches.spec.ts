/**
 * declared-branches.spec.ts — the branches come from the policy, not
 * from literals in whichever script needs them.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	declaredBranches,
	declaredMergeMethod,
	mergeFlagFor,
} from './declared-branches';
import { repoRoot } from './repo-root';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const workspaceWith = (config: unknown): string => {
	const root = mkdtempSync(join(tmpdir(), 'declared-branches-'));
	roots.push(root);
	writeFileSync(join(root, 'delendai.config.json'), JSON.stringify(config));
	return root;
};

describe('declaredBranches', () => {
	it('reads this repository’s integration and release branches', () => {
		const branches = declaredBranches(repoRoot());

		expect(branches.integration).toBe('develop');
		expect(branches.release).toBe('main');
	});

	it('resolves a workspace with no development block to the policy defaults', () => {
		const branches = declaredBranches(workspaceWith({}));

		expect(typeof branches.integration).toBe('string');
		expect(branches.integration).not.toBe('');
	});
});

describe('declaredMergeMethod', () => {
	it('reads how this repository lands a pull request', () => {
		// `shared-checkout-pr` declares `merge`, which is precisely why a
		// hardcoded `--merge` survived every review here.
		expect(declaredMergeMethod(repoRoot())).toBe('merge');
	});

	it('follows a project that declares another method', () => {
		const root = workspaceWith({
			development: { integration: { mergeMethod: 'squash' } },
		});

		expect(declaredMergeMethod(root)).toBe('squash');
	});

	it('resolves to the profile default when nothing is declared', () => {
		expect(['squash', 'merge', 'rebase']).toContain(
			declaredMergeMethod(workspaceWith({})),
		);
	});
});

describe('mergeFlagFor', () => {
	it('gives gh the flag for each method the policy can declare', () => {
		expect(mergeFlagFor('squash')).toBe('--squash');
		expect(mergeFlagFor('merge')).toBe('--merge');
		expect(mergeFlagFor('rebase')).toBe('--rebase');
	});
});
