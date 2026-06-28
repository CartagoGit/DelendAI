import { describe, expect, it } from 'vitest';
import {
	CONVENTIONAL_PREFIXES,
	CONVENTIONAL_RE,
	lintCommitMessage,
	MERGE_REVERT_RE,
} from './commit-msg-conventional.script';

describe('commit-msg-conventional (f00086 S3)', () => {
	describe('accepted — conventional commits', () => {
		it.each(CONVENTIONAL_PREFIXES)('accepts `%s: ...`', (prefix) => {
			const result = lintCommitMessage(`${prefix}: add the thing`);
			expect(result.ok).toBe(true);
		});

		it.each(CONVENTIONAL_PREFIXES)(
			'accepts `%s(scope): ...`',
			(prefix) => {
				const result = lintCommitMessage(
					`${prefix}(core): add the thing`,
				);
				expect(result.ok).toBe(true);
			},
		);

		it.each(CONVENTIONAL_PREFIXES)(
			'accepts `%s(scope)!: ...` (breaking-change marker)',
			(prefix) => {
				const result = lintCommitMessage(
					`${prefix}(core)!: add the thing`,
				);
				expect(result.ok).toBe(true);
			},
		);

		it('accepts `feat(proposals): f00086 swarm commit discipline`', () => {
			const result = lintCommitMessage(
				'feat(proposals): f00086 swarm commit discipline - worktree-only commits + conventional guards',
			);
			expect(result.ok).toBe(true);
		});

		it('is lenient on the subject after the colon (any length / case)', () => {
			expect(
				lintCommitMessage('fix: typo in the bootstrap link').ok,
			).toBe(true);
			expect(
				lintCommitMessage('chore: bump @types/node to 20.11.5').ok,
			).toBe(true);
		});

		it('accepts multi-line messages after a valid first line', () => {
			const msg = [
				'feat(core): add the ladder',
				'',
				'Body paragraph explaining why.',
				'BREAKING CHANGE: old API is removed.',
			].join('\n');
			expect(lintCommitMessage(msg).ok).toBe(true);
		});
	});

	describe('accepted — merge / revert carve-out', () => {
		it('accepts `Merge branch ...`', () => {
			expect(lintCommitMessage('Merge branch feature/x into develop').ok)
				.toBe(true);
		});

		it('accepts `Merge pull request #123 from ...`', () => {
			expect(
				lintCommitMessage(
					'Merge pull request #123 from copilot/feature',
				).ok,
			).toBe(true);
		});

		it('accepts `Revert "feat: ..."`', () => {
			expect(lintCommitMessage('Revert "feat: add the thing"').ok).toBe(
				true,
			);
		});
	});

	describe('rejected — non-conventional', () => {
		it('rejects `wip`', () => {
			const result = lintCommitMessage('wip');
			expect(result.ok).toBe(false);
		});

		it('rejects `Update stuff`', () => {
			const result = lintCommitMessage('Update stuff');
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blockers.join('\n')).toContain('next-action');
				expect(result.blockers.join('\n')).toContain('feat(scope)');
			}
		});

		it('rejects `Please provide the file changes ...` (the actual offender)', () => {
			const result = lintCommitMessage(
				'Please provide the file changes or a description of the modifications so I can generate the commit message for you.',
			);
			expect(result.ok).toBe(false);
		});

		it('rejects `merged feature/x` (lowercase, no type)', () => {
			expect(lintCommitMessage('merged feature/x').ok).toBe(false);
		});

		it('rejects a missing scope variant (`feat::` double colon)', () => {
			expect(lintCommitMessage('feat:: add the thing').ok).toBe(false);
		});

		it('rejects a scope with capital letters (`feat(Core): ...`)', () => {
			expect(lintCommitMessage('feat(Core): add the thing').ok).toBe(false);
		});
	});

	describe('rejected — empty / body-only', () => {
		it('rejects an empty message', () => {
			const result = lintCommitMessage('');
			expect(result.ok).toBe(false);
		});

		it('rejects a whitespace-only message', () => {
			expect(lintCommitMessage('   \n\n  \n').ok).toBe(false);
		});

		it('rejects a body-only message (first line is blank)', () => {
			const msg = ['\n', 'a body line'].join('');
			expect(lintCommitMessage(msg).ok).toBe(false);
		});

		it('rejects a comment-only first line', () => {
			expect(lintCommitMessage('# this is a git comment').ok).toBe(false);
		});
	});

	describe('regex sanity', () => {
		it('CONVENTIONAL_RE matches the 10 documented prefixes', () => {
			for (const p of CONVENTIONAL_PREFIXES) {
				expect(CONVENTIONAL_RE.test(`${p}: x`)).toBe(true);
			}
		});

		it('MERGE_REVERT_RE matches Merge and Revert but not other prefixes', () => {
			expect(MERGE_REVERT_RE.test('Merge branch x')).toBe(true);
			expect(MERGE_REVERT_RE.test('Revert "x"')).toBe(true);
			expect(MERGE_REVERT_RE.test('feat: x')).toBe(false);
			expect(MERGE_REVERT_RE.test('merge branch x')).toBe(false);
		});
	});
});
