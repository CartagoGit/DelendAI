/**
 * f00086 / c00086 V1 — `push-to-develop-discipline` pure engine.
 *
 * Pins the four rules the pre-push guard makes:
 *
 *   1. Pushing `develop → origin/develop` from `develop` → BLOCK.
 *      The agent forgot to open a feature branch.
 *   2. Pushing `agent/x → origin/develop` from `agent/x` → ALLOW
 *      (the PR-merge shape; the actual merge is the maintainer's
 *      decision).
 *   3. Pushing any branch to any non-develop remote → ALLOW.
 *   4. Detached HEAD / null current branch → fail-open.
 *
 * `parseGitPushArgs` is a separate pure helper that turns the
 * lefthook positional argv `{1} {2} {3} = remote remote_url refs`
 * into a `{ remote, remoteBranch }` pair. The unit spec covers
 * the four argv shapes the hook actually emits.
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard at the bottom
 * of the script keeps the side effects out of the import graph.
 */
import { describe, expect, it } from 'vitest';

import {
	lintPushToDevelop,
	parseGitPushArgs,
} from './push-to-develop-discipline.script';

describe('lintPushToDevelop', () => {
	it('blocks develop → origin/develop from develop (the policy violation)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers[0]).toContain('develop');
			expect(result.blockers[0]).toContain('origin/develop');
		}
	});

	it('allows agent/x → origin/develop (PR-merge shape)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(true);
	});

	it('allows feature/x → origin/develop (the same PR-merge shape)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'feature/f00086-discipline',
		});
		expect(result.ok).toBe(true);
	});

	it('allows develop → origin/feature/x (push develop to a feature branch)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'feature/x',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('allows develop → origin/agent/x (push to another agent branch)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'agent/copilot-minimax-m3',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('fails open on null currentBranch (detached HEAD carve-out)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: null,
		});
		expect(result.ok).toBe(true);
	});

	it('blocks the LEFTHOOK_BYPASS escape hatch in the message', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
		}
	});
});

describe('parseGitPushArgs', () => {
	it('parses the `remote refs/heads/local:refs/heads/remote` shape', () => {
		// The lefthook argv passed to the pre-push hook is
		// {1} {2} {3} = remote remote_url refs.
		const parsed = parseGitPushArgs(
			['origin', 'git@github.com:x/y.git', 'refs/heads/develop:refs/heads/develop'],
			null,
		);
		expect(parsed.remote).toBe('origin');
		expect(parsed.remoteBranch).toBe('develop');
	});

	it('parses the bare `remote branch` shape (no refs/ prefix)', () => {
		const parsed = parseGitPushArgs(['origin', 'develop'], null);
		expect(parsed.remote).toBe('origin');
		expect(parsed.remoteBranch).toBe('develop');
	});

	it('falls back to the current branch when no ref is given', () => {
		const parsed = parseGitPushArgs(['origin'], 'agent/copilot-minimax-m3');
		expect(parsed.remote).toBe('origin');
		expect(parsed.remoteBranch).toBe('agent/copilot-minimax-m3');
	});

	it('falls back to develop when no ref is given and no current branch', () => {
		const parsed = parseGitPushArgs(['origin'], null);
		expect(parsed.remote).toBe('origin');
		expect(parsed.remoteBranch).toBe('develop');
	});

	it('parses local→remote refspec (push develop to a feature branch)', () => {
		const parsed = parseGitPushArgs(
			['origin', 'git@x', 'refs/heads/develop:refs/heads/feature/x'],
			null,
		);
		expect(parsed.remoteBranch).toBe('feature/x');
	});

	it('skips flags in the positional collection', () => {
		const parsed = parseGitPushArgs(
			['--force', 'origin', '--tags', 'develop'],
			null,
		);
		expect(parsed.remote).toBe('origin');
		expect(parsed.remoteBranch).toBe('develop');
	});
});
