/**
 * f00086 / c00086 V1 — `commit-branch-discipline` pure engine.
 *
 * Pins the rules the pre-commit guard makes:
 *
 *   1. Detached HEAD / non-git cwd → fail-open (release engineers
 *      can check out a tag and commit a hotfix without a branch).
 *   2. The policy's integration branch (default `develop`) → allowed.
 *   3. With `agentWorktree` on → every branch allowed.
 *   4. With `agentWorktree` off → arbitrary working branches are blocked;
 *      `release/*` remains allowed for the release PR flow.
 *   5. Branches inside the policy's work or publication namespace are
 *      allowed: that is where shared-checkout-pr agents commit.
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
	it('[<30ms] fails open on detached HEAD (release-engineer carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: null,
		});
		expect(result.ok).toBe(true);
	});

	it('[<30ms] fails open on empty branch string (same carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: '',
		});
		expect(result.ok).toBe(true);
	});

	it('[<30ms] allows any number of deep files on develop (the shared branch)', () => {
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

	it('[<30ms] blocks a user-managed feature branch (gate off)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['README.md'],
			currentBranch: 'feature/some-thing',
		});
		expect(result.ok).toBe(false);
	});

	it('[<30ms] allows a release branch (gate off)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['README.md'],
			currentBranch: 'release/0.2.0',
		});
		expect(result.ok).toBe(true);
	});

	it('[<30ms] blocks an agent/* branch when the worktree gate is off', () => {
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
			// The remedy is the work-branch flow, never switching the shared
			// checkout back to develop to commit there.
			expect(result.blockers.join('\n')).not.toContain('git switch');
			expect(result.blockers.join('\n')).toContain('work branch');
		}
	});

	it('[<30ms] allows an agent/* branch when the worktree gate is on', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'agent/copilot-minimax-m3',
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(true);
	});

	it('[<30ms] blocks the LEFTHOOK_BYPASS escape hatch in the message', () => {
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
	describe('policy namespaces (x00546 model: visible work branches)', () => {
		const namespaces = {
			workRefPrefix: 'heads/delendai/wip/',
			// The template the policy resolves, so the refusal is rendered
			// from it rather than restated. It used to be written out here
			// AND in the script, with a dash where the engine puts a slash.
			workRefTemplate:
				'delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}',
			publicationRefPrefix: 'delendai/pr/',
		} as const;

		it('[<30ms] allows a work branch inside the policy work namespace', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch:
					'delendai/wip/claude-opus-5/x00546-notes-g1-codex-branch-disposition',
				...namespaces,
			});
			expect(result.ok).toBe(true);
		});

		it('[<30ms] allows a publication branch', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'delendai/pr/x00546-codex-branch-disposition',
				...namespaces,
			});
			expect(result.ok).toBe(true);
		});

		it('[<30ms] still blocks a branch outside both namespaces', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'feat/somebodys-branch',
				...namespaces,
			});
			expect(result.ok).toBe(false);
		});

		it('[<30ms] never tells an agent to switch the shared checkout back to develop', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'feat/somebodys-branch',
				...namespaces,
			});
			if (result.ok) throw new Error('expected a block');
			const text = result.blockers.join('\n');
			expect(text).not.toContain('git switch develop');
			// Exactly what the engine writes — a slash before the topic.
			// The old expectation pinned a dash, and an agent that complied
			// produced a ref nothing could claim, rename or publish.
			expect(text).toContain(
				'delendai/wip/<agent>/<proposal>-<slice>-g<generation>/<topic>',
			);
			expect(text).toContain('delendai/pr/<name>');
		});

		it('[<30ms] renders the shape from the template, never from a literal', () => {
			// An operator who declares another shape must be told THEIRS.
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'feat/somebodys-branch',
				...namespaces,
				workRefTemplate:
					'wip/${agent}/${slice}.${proposal}.g${generation}',
			});
			if (result.ok) throw new Error('expected a block');
			const text = result.blockers.join('\n');
			expect(text).toContain('<slice>.<proposal>.g<generation>');
			expect(text).not.toContain('<proposal>-<slice>');
		});

		it('[<30ms] says which setting decides the shape when none is declared', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'feat/somebodys-branch',
				...namespaces,
				workRefTemplate: '',
			});
			if (result.ok) throw new Error('expected a block');
			expect(result.blockers.join('\n')).toContain(
				'branches.workRefTemplate',
			);
		});

		it('[<30ms] does not treat a lookalike prefix as the work namespace', () => {
			const result = lintCommitBranch({
				cwd: '/tmp',
				stagedFiles: ['docs/a.md'],
				currentBranch: 'delendai/wipe/x',
				...namespaces,
			});
			expect(result.ok).toBe(false);
		});
	});
	describe('integration branch from the development policy', () => {
		it('[<30ms] allows the configured integration branch', () => {
			const result = lintCommitBranch({
				...baseInput,
				stagedFiles: ['README.md'],
				currentBranch: 'trunk',
				integrationBranch: 'trunk',
			});
			expect(result.ok).toBe(true);
		});

		it('[<30ms] does not treat develop as shared when the policy integrates elsewhere', () => {
			const result = lintCommitBranch({
				...baseInput,
				stagedFiles: ['README.md'],
				currentBranch: 'develop',
				integrationBranch: 'trunk',
			});
			expect(result.ok).toBe(false);
		});

		it('[<30ms] does not refuse a CI checkout of the release branch, which is a merged pull request', () => {
			const result = lintCommitBranch({
				...baseInput,
				currentBranch: 'main',
				releaseBranch: 'main',
				ciCheckout: true,
			});
			expect(result).toEqual({
				ok: true,
				note: expect.stringContaining('NOT_APPLICABLE'),
			});
		});

		it('[<30ms] still refuses a commit on the release branch outside CI, or with something staged', () => {
			for (const ciCheckout of [false, undefined]) {
				expect(
					lintCommitBranch({
						...baseInput,
						stagedFiles: ['README.md'],
						currentBranch: 'main',
						releaseBranch: 'main',
						...(ciCheckout === undefined ? {} : { ciCheckout }),
					}).ok,
				).toBe(false);
			}
			// Another branch in CI is judged as before.
			expect(
				lintCommitBranch({
					...baseInput,
					currentBranch: 'feature/x',
					releaseBranch: 'main',
					ciCheckout: true,
				}).ok,
			).toBe(false);
		});

		it('[<30ms] admits the CI checkout of a merge train, under every train namespace', () => {
			for (const branch of [
				'delendai/train/091f009583c2/1861',
				'train/091f009583c2/1861-1830',
			]) {
				expect(
					lintCommitBranch({
						...baseInput,
						currentBranch: branch,
						trainRefPrefixes: ['delendai/train/', 'train/'],
						ciCheckout: true,
					}).ok,
				).toBe(true);
			}
			expect(
				lintCommitBranch({
					...baseInput,
					currentBranch: 'trains/x',
					trainRefPrefixes: ['delendai/train/', 'train/'],
					ciCheckout: true,
				}).ok,
			).toBe(false);
		});

		it('[<30ms] keeps develop as the default when no policy was read', () => {
			const result = lintCommitBranch({
				...baseInput,
				stagedFiles: ['README.md'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});
	});
});

describe('a namespace transition (f00808)', () => {
	const moved = {
		...baseInput,
		stagedFiles: ['packages/core/src/foo.ts'],
		workRefPrefix: 'heads/wip/',
		publicationRefPrefix: 'pr/',
		formerPrefixes: ['heads/delendai/wip/', 'delendai/pr/'],
	};

	it('[<20ms] lets a unit under the former namespace commit, and one under the current', () => {
		expect(
			lintCommitBranch({
				...moved,
				currentBranch: 'delendai/wip/agent-a/implement/x1-S1-g1/t',
			}).ok,
		).toBe(true);
		expect(
			lintCommitBranch({
				...moved,
				currentBranch: 'wip/agent-a/implement/x1-S1-g1/t',
			}).ok,
		).toBe(true);
	});

	it('[<20ms] still refuses a branch outside every namespace', () => {
		expect(
			lintCommitBranch({ ...moved, currentBranch: 'feature/mine' }).ok,
		).toBe(false);
	});
});
