import { describe, expect, it } from 'vitest';
import {
	lintPushToDevelop,
	parseGitPushArgs,
} from './push-to-develop-discipline.script';

const REPO = '/fake/repo';

describe('push-to-develop-discipline (f00086 S2)', () => {
	describe('develop → develop (the block case)', () => {
		it('blocks when currentBranch=develop and remoteBranch=develop', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'develop',
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				const text = result.blockers.join('\n');
				expect(text).toContain('next-action');
				expect(text).toContain('agent/<your-name>-<id>');
			}
		});
	});

	describe('develop → agent/* (allowed)', () => {
		it('allows pushing develop to a non-develop branch', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'agent/copilot-f00086',
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});

		it('allows pushing develop to a feature branch', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'feature/x',
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('agent/* → develop (allowed — PR-merge shape)', () => {
		it('allows pushing develop from a feature branch', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'develop',
				currentBranch: 'agent/copilot-f00086',
			});
			expect(result.ok).toBe(true);
		});

		it('allows pushing develop from main', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'develop',
				currentBranch: 'main',
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('any other branch (allowed)', () => {
		it('allows pushing any non-develop branch from any non-develop branch', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'agent/x',
				currentBranch: 'agent/y',
			});
			expect(result.ok).toBe(true);
		});

		it('blocks pushing develop to a non-origin remote when current=develop', () => {
			// remote is irrelevant for the rule (we only check the
			// target branch name); same outcome as origin/develop.
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'upstream',
				remoteBranch: 'develop',
				currentBranch: 'develop',
			});
			expect(result.ok).toBe(false);
		});
	});

	describe('detached HEAD — fail-open', () => {
		it('returns ok when currentBranch is null and target is develop', () => {
			const result = lintPushToDevelop({
				cwd: REPO,
				remoteName: 'origin',
				remoteBranch: 'develop',
				currentBranch: null,
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('parseGitPushArgs (pure helper)', () => {
		it('returns origin + currentBranch fallback when no args', () => {
			expect(parseGitPushArgs([], 'develop')).toEqual({
				remote: 'origin',
				remoteBranch: 'develop',
			});
		});

		it('parses `origin develop`', () => {
			expect(parseGitPushArgs(['origin', 'develop'], 'agent/x')).toEqual({
				remote: 'origin',
				remoteBranch: 'develop',
			});
		});

		it('parses `origin develop:develop`', () => {
			expect(parseGitPushArgs(['origin', 'develop:develop'], 'agent/x'))
				.toEqual({
					remote: 'origin',
					remoteBranch: 'develop',
				});
		});

		it('parses `origin agent/x:develop` (PR-merge shape)', () => {
			expect(parseGitPushArgs(['origin', 'agent/x:develop'], 'agent/x'))
				.toEqual({
					remote: 'origin',
					remoteBranch: 'develop',
				});
		});

		it('parses `origin develop:agent/x` (rejected by rule anyway)', () => {
			expect(parseGitPushArgs(['origin', 'develop:agent/x'], 'develop'))
				.toEqual({
					remote: 'origin',
					remoteBranch: 'agent/x',
				});
		});

		it('skips flag-like args', () => {
			expect(
				parseGitPushArgs(['--follow-tags', 'origin', 'develop'], 'agent/x'),
			).toEqual({
				remote: 'origin',
				remoteBranch: 'develop',
			});
		});

		it('falls back to the current branch when no ref is given', () => {
			expect(parseGitPushArgs(['origin'], 'agent/x')).toEqual({
				remote: 'origin',
				remoteBranch: 'agent/x',
			});
		});
	});
});
