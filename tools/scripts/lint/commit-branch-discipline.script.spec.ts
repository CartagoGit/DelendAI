/**
 * f00086 / c00086 V1 — `commit-branch-discipline` pure engine
 * (policy flipped 2026-08-24: single shared `develop` branch).
 *
 * Pins the three rules the pre-commit guard makes:
 *
 *   1. Detached HEAD / non-git cwd → fail-open (release engineers
 *      can check out a tag and commit a hotfix without a branch).
 *   2. `develop` → always allowed (the shared branch; agents commit
 *      and push together).
 *   3. Any other branch (`agent/*`, `feature/*`) → BLOCK with a
 *      next-action telling the agent to switch back to develop.
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

	it('blocks an agent/* branch and tells the agent to switch to develop', () => {
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

	it('blocks a feature/* branch too (no new branches)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['README.md'],
			currentBranch: 'feature/some-thing',
		});
		expect(result.ok).toBe(false);
	});

	it('blocks the LEFTHOOK_BYPASS escape hatch in the message', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'feature/some-thing',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
		}
	});
});
