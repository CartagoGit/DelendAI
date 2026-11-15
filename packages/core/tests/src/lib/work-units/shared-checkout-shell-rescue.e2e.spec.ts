/**
 * shared-checkout-shell-rescue.e2e.spec.ts — the rescue itself, against a
 * real repository: loose edits of an agent that holds a unit are kept under
 * a ref, the checkout is restored, and the unit worktree is named. The
 * silent cases are in shared-checkout-shell-rescue.service.spec.ts.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { rescueAfterShell } from '@delendai/core/lib/work-units/shared-checkout-shell-rescue.service';

const AGENT = 'claude-opus-5-5';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.txt': 'as it was\n' },
	worktrees: { unit: `delendai/wip/${AGENT}/implement/x1-S1-g1/probe` },
});

describe('rescueAfterShell', () => {
	it('[<312ms] rescues loose edits and names the unit worktree', () => {
		const copy = template.copy();
		const root = copy.root;
		writeFileSync(join(root, 'a.txt'), 'edited by a heredoc\n');
		const verdict = rescueAfterShell({ cwd: root, agent: AGENT, policy });
		expect(verdict.outcome).toBe('rescued');
		expect(verdict.message).toContain(copy.worktrees.unit ?? '');
		expect(git(root, 'status', '--porcelain')).toBe('');
	});
});
