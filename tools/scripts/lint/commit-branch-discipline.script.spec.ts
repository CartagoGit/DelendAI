import { describe, expect, it } from 'vitest';
import {
	findDeepPathViolations,
	lintCommitBranch,
	MAX_RESIDUAL_FILES,
} from './commit-branch-discipline.script';

const REPO = '/fake/repo';

describe('commit-branch-discipline (f00086 S1)', () => {
	describe('clean develop — small residual fix', () => {
		it('allows a single typo file outside deep paths', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['README.md'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});

		it(`allows up to ${MAX_RESIDUAL_FILES} files outside deep paths`, () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['README.md', 'AGENTS.md', '.gitignore'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});

		it('allows a small change inside `apps/web/` (not a deep path)', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['apps/web/src/components/Footer.astro'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('develop — deep path violation', () => {
		it('blocks a single file under `docs/mcp-vertex/proposals/`', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['docs/mcp-vertex/proposals/ready/f00086-foo.md'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blockers.join('\n')).toContain('next-action');
				expect(result.blockers.join('\n')).toContain('agent/<your-name>-<id>');
			}
		});

		it('blocks a single file under `packages/*/src/`', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['packages/core/src/lib/foo.ts'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
		});

		it('blocks a single file under `plugins/*/src/`', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['plugins/proposals/src/lib/foo.ts'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
		});

		it('blocks a single file under `tools/scripts/`', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['tools/scripts/lint/foo.script.ts'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
		});

		it('blocks a mixed batch with at least one deep-path file', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: [
					'README.md',
					'packages/core/src/lib/foo.ts',
					'.gitignore',
				],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
		});

		it('blocks a develop commit with too many residual files (no deep path)', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['a.md', 'b.md', 'c.md', 'd.md'],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blockers.join('\n')).toContain('too much');
			}
		});
	});

	describe('non-develop branch — always allowed', () => {
		it('allows an `agent/x` branch to commit a proposal file', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['docs/mcp-vertex/proposals/ready/f00086-foo.md'],
				currentBranch: 'agent/copilot-f00086',
			});
			expect(result.ok).toBe(true);
		});

		it('allows an `agent/x` branch to commit a package source file', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['packages/core/src/lib/foo.ts'],
				currentBranch: 'agent/copilot-f00086',
			});
			expect(result.ok).toBe(true);
		});

		it('allows a `feature/*` branch to commit any file', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['plugins/proposals/src/lib/foo.ts'],
				currentBranch: 'feature/anything',
			});
			expect(result.ok).toBe(true);
		});

		it('allows a `main` branch to commit (out of scope for the rule)', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['packages/core/src/lib/foo.ts'],
				currentBranch: 'main',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('detached HEAD — fail-open', () => {
		it('returns ok for a null branch (detached HEAD)', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['packages/core/src/lib/foo.ts'],
				currentBranch: null,
			});
			expect(result.ok).toBe(true);
		});

		it('returns ok for an empty branch string', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: ['packages/core/src/lib/foo.ts'],
				currentBranch: '',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('empty staged set', () => {
		it('returns ok when nothing is staged on develop', () => {
			const result = lintCommitBranch({
				cwd: REPO,
				stagedFiles: [],
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('findDeepPathViolations (pure helper)', () => {
		it('returns only the deep-path files from a mixed batch', () => {
			const result = findDeepPathViolations([
				'README.md',
				'packages/core/src/lib/foo.ts',
				'plugins/proposals/src/lib/foo.ts',
				'tools/scripts/lint/foo.script.ts',
				'docs/mcp-vertex/proposals/ready/f00086.md',
			]);
			expect(result).toEqual([
				'packages/core/src/lib/foo.ts',
				'plugins/proposals/src/lib/foo.ts',
				'tools/scripts/lint/foo.script.ts',
				'docs/mcp-vertex/proposals/ready/f00086.md',
			]);
		});

		it('returns [] when no file matches a deep path', () => {
			expect(findDeepPathViolations(['README.md', '.gitignore'])).toEqual(
				[],
			);
		});
	});
});
