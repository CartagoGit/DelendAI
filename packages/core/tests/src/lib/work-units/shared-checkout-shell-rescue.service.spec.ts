/**
 * shared-checkout-shell-rescue.service.spec.ts — after a shell command, an
 * agent that holds a unit and left loose edits in the shared checkout has
 * them rescued, and is told the unit worktree; every other case is silent.
 *
 * The cases that decide nothing but "silent" are answered from a table of
 * what git says, so no process runs; the rescue itself, which moves files
 * and refs, is proved against a real repository in the e2e spec beside it.
 */
import { describe, expect, it } from 'vitest';

import { createInMemoryGit, gitReadCacheOf } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { withGitReadCache } from '@delendai/core/lib/shared/git-read.helper';
import { rescueAfterShell } from '@delendai/core/lib/work-units/shared-checkout-shell-rescue.service';

const AGENT = 'claude-opus-5-5';
const ROOT = '/shared/checkout';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

/** The porcelain v2 status of a checkout: its branch header, then one entry per path. */
const status = (...paths: readonly string[]): string =>
	[
		'# branch.head develop',
		...paths.map((path) => `1 .M N... 100644 100644 100644 h1 h2 ${path}`),
	].join('\0') + '\0';

/** What git says of a shared checkout on `develop` holding `worktrees`, with `edited` loose. */
const checkout = (
	edited: readonly string[],
	worktrees: readonly (readonly [path: string, branch: string])[] = [],
): ReturnType<typeof createInMemoryGit> =>
	createInMemoryGit({
		'status --porcelain=v2 --branch -z --untracked-files=all': status(
			...edited,
		),
		'worktree list --porcelain': [
			`worktree ${ROOT}\nHEAD abc\nbranch refs/heads/develop`,
			...worktrees.map(
				([path, branch]) =>
					`worktree ${path}\nHEAD abc\nbranch refs/heads/${branch}`,
			),
		].join('\n\n'),
	});

const rescue = (git: ReturnType<typeof createInMemoryGit>, agent: string) =>
	withGitReadCache(gitReadCacheOf(git), () =>
		rescueAfterShell({ cwd: ROOT, agent, policy }),
	);

describe('rescueAfterShell', () => {
	it('[<35ms] says nothing for a clean checkout', () => {
		const git = checkout(
			[],
			[['/unit', `delendai/wip/${AGENT}/implement/x1-S1-g1/probe`]],
		);
		expect(rescue(git, AGENT)).toEqual({ outcome: 'none' });
		expect(git.calls).toHaveLength(2);
	});

	it('[<35ms] leaves the edits of an agent that holds no unit, and of an unidentified one', () => {
		const git = checkout(
			['a.txt'],
			[['/unit', `delendai/wip/${AGENT}/implement/x1-S1-g1/probe`]],
		);
		for (const agent of ['claude-opus-5-6', '']) {
			expect(rescue(git, agent).outcome).toBe('none');
		}
	});
});
