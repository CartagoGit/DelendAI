/**
 * f00086 / c00086 V1 — `push-to-develop-discipline` pure engine
 * (refined 2026-08-27: `develop` only lands via PR — no direct push).
 *
 * Pins the rules the pre-push guard makes:
 *
 *   1. Pushing to `develop` (any source branch) → BLOCK. Work lands
 *      on `develop` only through a pull request.
 *   2. Pushing to `main` → ALLOW (release flow; versioning is
 *      derived on push to `main`).
 *   3. With `agentWorktree` on → every source branch allowed (still
 *      subject to rule 1).
 *   4. With `agentWorktree` off → `agent/*` source branches blocked;
 *      user-managed branches (`wip/*`, `fix/*`, `feature/*`) allowed
 *      (still subject to rule 1). Detached HEAD / null current
 *      branch → fail-open (still subject to rule 1).
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
	isReleaseBranch,
	lintPrePushStdinUpdates,
	lintPushToDevelop,
	parseGitPushArgs,
	parsePrePushStdin,
} from './push-to-develop-discipline.script';

describe('lintPushToDevelop', () => {
	it('allows develop → origin/develop (the operator works on this branch)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks wip/x → origin/develop (direct push — must go through a PR)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'wip/some-slug',
		});
		expect(result.ok).toBe(false);
	});

	it('allows develop → origin/develop with the worktree gate on', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'develop',
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(true);
	});

	it('blocks develop → origin/main (direct push to main)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'main',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('ADR 0018');
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
			expect(result.blockers.join('\n')).toContain('`main`');
		}
	});

	it('blocks main → origin/main before any develop-specific rule', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'main',
			currentBranch: 'main',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('ADR 0018');
			expect(result.blockers.join('\n')).toContain('pull request');
			expect(result.blockers.join('\n')).not.toContain('into `develop`');
		}
	});

	it('blocks agent/x → origin/wip-target (no new branches)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'wip/some-slug',
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'agent/copilot-minimax-m3',
			);
			expect(result.blockers.join('\n')).toContain('wip/');
		}
	});

	it('blocks agent/x → origin/develop when the worktree gate is off', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'agent/copilot-minimax-m3',
			agentWorktreeEnabled: false,
		});
		expect(result.ok).toBe(false);
	});

	it('allows agent/x → origin/wip-target when the worktree gate is on', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'wip/some-slug',
			currentBranch: 'agent/copilot-minimax-m3',
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(true);
	});

	it('allows feature/x → origin/feature/x (user-managed branch, gate off)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'feature/f00086-discipline',
			currentBranch: 'feature/f00086-discipline',
		});
		expect(result.ok).toBe(true);
	});

	it('allows wip/x → origin/wip/x (the intended landing-branch push)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'wip/some-slug',
			currentBranch: 'wip/some-slug',
		});
		expect(result.ok).toBe(true);
	});

	it('fails open on null currentBranch pushing to a non-develop target (detached HEAD carve-out)', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'wip/some-slug',
			currentBranch: null,
		});
		expect(result.ok).toBe(true);
	});

	it('allows a null currentBranch pushing to develop (detached HEAD carve-out)', () => {
		// A detached HEAD cannot be identified as agent work, and develop is
		// not a protected branch, so there is nothing to refuse.
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
			remoteBranch: 'wip/some-slug',
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
		}
	});
});

describe('lintPushToDevelop release branch discipline', () => {
	it('blocks release/v1 → origin/main', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'main',
			currentBranch: 'release/v1',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'release branches land on main through a pull request',
			);
		}
	});

	it('blocks release/v1 → origin/release/v2', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'release/v2',
			currentBranch: 'release/v1',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'must not merge into another release branch',
			);
		}
	});

	it('allows release/v1 → origin/release/v1', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'release/v1',
			currentBranch: 'release/v1',
		});
		expect(result.ok).toBe(true);
	});

	it('allows develop → origin/release/v1', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'release/v1',
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks feature/x → origin/release/v1', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'release/v1',
			currentBranch: 'feature/x',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'only receive promotion from `develop`',
			);
		}
	});

	it('blocks release/v1 → origin/develop', () => {
		const result = lintPushToDevelop({
			cwd: '/repo',
			remoteName: 'origin',
			remoteBranch: 'develop',
			currentBranch: 'release/v1',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain(
				'do not merge back into develop directly',
			);
		}
	});
});

describe('isReleaseBranch', () => {
	it('matches the canonical release/ prefix', () => {
		expect(isReleaseBranch('release/v1')).toBe(true);
		expect(isReleaseBranch('develop')).toBe(false);
	});
});

describe('parseGitPushArgs', () => {
	it('parses the `remote refs/heads/local:refs/heads/remote` shape', () => {
		// The lefthook argv passed to the pre-push hook is
		// {1} {2} {3} = remote remote_url refs.
		const parsed = parseGitPushArgs(
			[
				'origin',
				'git@github.com:x/y.git',
				'refs/heads/develop:refs/heads/develop',
			],
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

// x00159 S1 — git's real pre-push hook contract passes ref updates on
// STDIN (`<local ref> <local oid> <remote ref> <remote oid>`), not as
// a third CLI argument. lefthook's `{3}` template has nothing to
// substitute for a plain `git push`, so it shipped the literal string
// `"{3}"` as argv[2] — which `parseGitPushArgs` happily parsed as a
// branch named `{3}` (not `develop`), silently defeating the guard
// for exactly the case it exists to catch. These tests pin the real
// contract instead.
describe('parsePrePushStdin', () => {
	it('parses a single ref-update line', () => {
		const updates = parsePrePushStdin(
			'refs/heads/develop aaaa000000000000000000000000000000000a refs/heads/develop bbbb000000000000000000000000000000000b\n',
		);
		expect(updates).toEqual([
			{
				localRef: 'refs/heads/develop',
				localSha: 'aaaa000000000000000000000000000000000a',
				remoteRef: 'refs/heads/develop',
				remoteSha: 'bbbb000000000000000000000000000000000b',
			},
		]);
	});

	it('parses multiple ref-update lines (multi-ref push)', () => {
		const stdin = [
			'refs/heads/develop aaaa000000000000000000000000000000000a refs/heads/develop bbbb000000000000000000000000000000000b',
			'refs/heads/agent/x cccc000000000000000000000000000000000c refs/heads/agent/x dddd000000000000000000000000000000000d',
		].join('\n');
		expect(parsePrePushStdin(stdin)).toHaveLength(2);
	});

	it('ignores blank lines and malformed lines', () => {
		const stdin = [
			'',
			'   ',
			'not-four-fields',
			'refs/heads/develop aaaa000000000000000000000000000000000a refs/heads/develop bbbb000000000000000000000000000000000b',
		].join('\n');
		expect(parsePrePushStdin(stdin)).toHaveLength(1);
	});

	it('returns an empty list for empty stdin (no push in flight)', () => {
		expect(parsePrePushStdin('')).toEqual([]);
	});
});

describe('lintPrePushStdinUpdates', () => {
	const ZERO_SHA = '0'.repeat(40);
	const SHA_A = 'a'.repeat(40);
	const SHA_B = 'b'.repeat(40);

	it('allows a direct develop → origin/develop update (operator working branch)', () => {
		const result = lintPrePushStdinUpdates([
			{
				localRef: 'refs/heads/develop',
				localSha: SHA_A,
				remoteRef: 'refs/heads/develop',
				remoteSha: SHA_B,
			},
		]);
		expect(result.ok).toBe(true);
	});

	it('blocks an agent branch pushed to origin/develop (no new branches)', () => {
		const result = lintPrePushStdinUpdates([
			{
				localRef: 'refs/heads/agent/copilot-minimax-m3',
				localSha: SHA_A,
				remoteRef: 'refs/heads/develop',
				remoteSha: SHA_B,
			},
		]);
		expect(result.ok).toBe(false);
	});

	it('allows an agent branch pushed to a non-develop target when the worktree gate is on', () => {
		const result = lintPrePushStdinUpdates(
			[
				{
					localRef: 'refs/heads/agent/copilot-minimax-m3',
					localSha: SHA_A,
					remoteRef: 'refs/heads/agent/copilot-minimax-m3',
					remoteSha: SHA_B,
				},
			],
			true,
		);
		expect(result.ok).toBe(true);
	});

	it('still blocks a push to develop even when the worktree gate is on', () => {
		const result = lintPrePushStdinUpdates(
			[
				{
					localRef: 'refs/heads/agent/copilot-minimax-m3',
					localSha: SHA_A,
					remoteRef: 'refs/heads/develop',
					remoteSha: SHA_B,
				},
			],
			true,
		);
		expect(result.ok).toBe(false);
	});

	it('blocks main pushed to origin/main', () => {
		const result = lintPrePushStdinUpdates([
			{
				localRef: 'refs/heads/main',
				localSha: SHA_A,
				remoteRef: 'refs/heads/main',
				remoteSha: SHA_B,
			},
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('ADR 0018');
		}
	});

	it('does not block a branch delete (all-zero local oid)', () => {
		const result = lintPrePushStdinUpdates([
			{
				localRef: '(delete)',
				localSha: ZERO_SHA,
				remoteRef: 'refs/heads/develop',
				remoteSha: SHA_B,
			},
		]);
		expect(result.ok).toBe(true);
	});

	it('allows an empty update list (no push in flight)', () => {
		expect(lintPrePushStdinUpdates([]).ok).toBe(true);
	});

	it('blocks on the first offending ref in a multi-ref push', () => {
		const result = lintPrePushStdinUpdates([
			{
				localRef: 'refs/heads/develop',
				localSha: SHA_A,
				remoteRef: 'refs/heads/develop',
				remoteSha: SHA_B,
			},
			{
				localRef: 'refs/heads/agent/x',
				localSha: SHA_A,
				remoteRef: 'refs/heads/agent/x',
				remoteSha: SHA_B,
			},
		]);
		expect(result.ok).toBe(false);
	});
});
