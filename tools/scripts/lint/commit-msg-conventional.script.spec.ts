/**
 * f00086 / c00086 V1 — `commit-msg-conventional` pure engine.
 *
 * Pins the four rules the commit-msg guard makes:
 *
 *   1. Empty / whitespace-only messages → BLOCK.
 *   2. Comment-only first lines (start with `#`) → BLOCK.
 *   3. First line must match the conventional-commits regex
 *      (the same regex `derive-version.ts` uses to compute the
 *      next semver bump) → ALLOW.
 *   4. Merge / revert commits (`Merge ...` / `Revert ...`) →
 *      ALLOW. Git-generated commits are exempt.
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard at the bottom
 * of the script keeps the side effects out of the import graph.
 */
import { describe, expect, it } from 'vitest';

import { lintCommitMessage } from './commit-msg-conventional.script';

describe('lintCommitMessage', () => {
	it('allows a plain conventional feat() commit', () => {
		const result = lintCommitMessage('feat(core): add IAgentIdentity');
		expect(result.ok).toBe(true);
	});

	it('allows every conventional prefix in the standard set', () => {
		for (const prefix of [
			'feat',
			'fix',
			'chore',
			'docs',
			'refactor',
			'test',
			'build',
			'ci',
			'perf',
			'style',
		]) {
			expect(
				lintCommitMessage(`${prefix}: something here`).ok,
				`prefix ${prefix} should be accepted`,
			).toBe(true);
		}
	});

	it('allows a breaking-change marker (`!` before the colon)', () => {
		const result = lintCommitMessage(
			'feat(api)!: rename /commit to /git-commit',
		);
		expect(result.ok).toBe(true);
	});

	it('allows a scope in parens with a hyphen (e.g. `host-hints`)', () => {
		const result = lintCommitMessage(
			'feat(host-hints): add f00086 S3 fragments',
		);
		expect(result.ok).toBe(true);
	});

	it('allows a Merge commit (git-generated, exempt)', () => {
		const result = lintCommitMessage(
			"Merge branch 'agent/x' into develop",
		);
		expect(result.ok).toBe(true);
	});

	it('allows a Revert commit (git-generated, exempt)', () => {
		const result = lintCommitMessage(
			'Revert "feat(core): add a thing"',
		);
		expect(result.ok).toBe(true);
	});

	it('blocks an empty first line', () => {
		const result = lintCommitMessage('');
		expect(result.ok).toBe(false);
	});

	it('blocks a whitespace-only first line', () => {
		const result = lintCommitMessage('   \n\nthis is the body');
		expect(result.ok).toBe(false);
	});

	it('blocks a first line starting with `#` (a comment, not a subject)', () => {
		const result = lintCommitMessage(
			'# this is a git comment, not a subject',
		);
		expect(result.ok).toBe(false);
	});

	it('blocks a free-form first line that has no conventional prefix', () => {
		const result = lintCommitMessage('just a regular message');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers[0]).toContain('conventional commit');
		}
	});

	it('blocks an unknown prefix that is NOT in the conventional set', () => {
		const result = lintCommitMessage('wip: half-baked subject');
		expect(result.ok).toBe(false);
	});

	it('uses ONLY the first line of a multi-line message for the prefix check', () => {
		const result = lintCommitMessage(
			'feat(scope): first-line subject\n\nbody line 1\nbody line 2',
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.firstLine).toBe('feat(scope): first-line subject');
	});

	it('blocks when the conventional prefix is on a non-first line (whole message matters)', () => {
		const result = lintCommitMessage(
			'\n\nfeat(scope): the prefix is on line 3, not line 1',
		);
		expect(result.ok).toBe(false);
	});
});
