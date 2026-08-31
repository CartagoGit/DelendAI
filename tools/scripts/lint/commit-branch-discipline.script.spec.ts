/**
 * f00086 / c00086 V1 — `commit-branch-discipline` pure engine.
 *
 * Pins the rules the pre-commit guard makes:
 *
 *   1. Detached HEAD / non-git cwd → fail-open (release engineers
 *      can check out a tag and commit a hotfix without a branch).
 *   2. `develop` → always allowed (the shared branch).
 *   3. With `agentWorktree` on → every branch allowed.
 *   4. With `agentWorktree` off → arbitrary working branches are blocked;
 *      `release/*` remains allowed for the release PR flow.
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard at the bottom
 * of the script keeps the side effects out of the import graph.
 */
import { describe, expect, it } from 'vitest';

import { lintCommitBranch } from './commit-branch-discipline.script';

const baseInput = {
	cwd: '/repo',
	stagedFiles: [] as readonly string[],
};

describe('lintCommitBranch', () => {
	it('fails open on detached HEAD (release-engineer carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: null,
		});
		expect(result.ok).toBe(true);
	});

	it('fails open on empty branch string (same carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: '',
		});
		expect(result.ok).toBe(true);
	});

	it('allows any number of deep files on develop (the shared branch)', () => {
		const staged = Array.from(
			{ length: 10 },
			(_, i) => `packages/core/src/lib/foo-${i}.ts`,
		);
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: staged,
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks a user-managed feature branch (gate off)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['README.md'],
			currentBranch: 'feature/some-thing',
		});
		expect(result.ok).toBe(false);
	});

	it('allows a release branch (gate off)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['README.md'],
			currentBranch: 'release/0.2.0',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks an agent/* branch when the worktree gate is off', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'agent/copilot-minimax-m3',
			);
			expect(result.blockers.join('\n')).toContain('git switch develop');
		}
	});

	it('allows an agent/* branch when the worktree gate is on', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'agent/copilot-minimax-m3',
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(true);
	});

	it('blocks the LEFTHOOK_BYPASS escape hatch in the message', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
		}
	});
});
