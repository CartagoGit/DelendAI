/**
 * git-runner-failure-reason.spec.ts — why a failed git command must
 * report git's own words.
 *
 * `git commit` with an empty index writes "nothing to commit, working
 * tree clean" to STDOUT and exits 1, leaving stderr empty. The runner
 * used to read stderr alone and fall back to the exec error's message,
 * which is only the command echo:
 *
 *   Command failed: git commit --author=… -m feat(x00001): …
 *
 * That is not merely unhelpful. commit-policy classifies "nothing to
 * commit" as a TERMINAL outcome precisely so a slice whose work is
 * already committed stops retrying — and it classifies on this reason
 * string. With the reason reduced to the echo, the match never fired,
 * the event stayed pending, and an adopter project's listener re-emitted
 * eight slices about once a second, indefinitely, on 2026-09-03.
 *
 * So this is a loop-prevention test wearing an error-message costume.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createGitRunner } from '../../../../src/lib/shared/git-write';

describe('createGitRunner failure reasons', () => {
	let repo = '';

	beforeEach(async () => {
		repo = await mkdtemp(join(tmpdir(), 'git-runner-reason-'));
		const run = createGitRunner(repo);
		await run(['init', '-q', '-b', 'main']);
		await run(['config', 'user.email', 'test@example.com']);
		await run(['config', 'user.name', 'Test']);
		await writeFile(join(repo, 'a.txt'), 'a\n');
		await run(['add', 'a.txt']);
		await run(['commit', '-q', '-m', 'chore: initial']);
	});
	afterEach(async () => {
		await rm(repo, { recursive: true, force: true });
	});

	it('reports git’s own words when it writes them to stdout', async () => {
		const run = createGitRunner(repo);
		const result = await run(['commit', '-m', 'chore: nothing staged']);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/nothing to commit|no changes added/iu);
		expect(result.reason).not.toContain('Command failed:');
	});

	it('reports git’s own words for a pathspec that matches nothing', async () => {
		const run = createGitRunner(repo);
		const result = await run(['add', '--', 'does/not/exist.ts']);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('did not match any files');
	});

	it('finds git’s reason under a hook runner that floods stderr', async () => {
		// The 2026-09-03 relapse. lefthook prints a banner and one
		// "(skip)" line per hook — to STDERR — on every commit. The
		// runner read `stderr || stdout`, so stderr was never empty,
		// stdout was never consulted, and "nothing to commit" vanished
		// again. Reason: 600 chars of box-drawing; code: UNKNOWN_REFUSAL;
		// effect: the same infinite re-emit, one fix later.
		const hook = join(repo, '.git', 'hooks', 'pre-commit');
		await writeFile(
			hook,
			[
				'#!/bin/sh',
				'echo "╭──────────────────────────────────────────╮" >&2',
				'echo "│ 🥊 lefthook v2.1.10  hook: pre-commit    │" >&2',
				'echo "╰──────────────────────────────────────────╯" >&2',
				'i=0; while [ $i -lt 20 ]; do',
				'  echo "│  stray-files-check (skip) no matching staged files" >&2',
				'  i=$((i+1));',
				'done',
				'echo "summary: (done in 0.02 seconds)" >&2',
				'exit 0',
			].join('\n'),
		);
		await chmod(hook, 0o755);

		const run = createGitRunner(repo);
		const result = await run(['commit', '-m', 'chore: nothing staged']);
		expect(result.ok).toBe(false);
		// The classifier matches on a substring of this exact string, so
		// surviving the cap is the whole assertion.
		expect(result.reason).toMatch(/nothing to commit|no changes added/iu);
	});

	it('sorts mcp-vertex’s own banner below git’s explanation', async () => {
		// A hook in this repo boots mcp-vertex, so a push captures our
		// own startup notice and generator progress. On 2026-09-03 a
		// real push failure came back as "failed to push some refs"
		// followed by three lines of privacy notice, and the 600-char
		// cap cut git's actual explanation of WHY it was rejected.
		const hook = join(repo, '.git', 'hooks', 'pre-commit');
		await writeFile(
			hook,
			[
				'#!/bin/sh',
				'i=0; while [ $i -lt 30 ]; do',
				'  echo "[mcp-vertex] error-reporting is ON: bugs are reported automatically." >&2',
				'  echo "gen:agent-md → plugins/error-reporting/AGENT.md" >&2',
				'  i=$((i+1));',
				'done',
				'exit 0',
			].join('\n'),
		);
		await chmod(hook, 0o755);

		const run = createGitRunner(repo);
		const result = await run(['commit', '-m', 'chore: nothing staged']);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/nothing to commit|no changes added/iu);
		// Our own banner may appear, but never ahead of the diagnosis.
		const reason = result.reason ?? '';
		const bannerAt = reason.indexOf('[mcp-vertex]');
		const causeAt = reason.search(/nothing to commit|no changes added/iu);
		expect(bannerAt === -1 || causeAt < bannerAt).toBe(true);
	});

	it('still reports stderr when git uses it', async () => {
		const run = createGitRunner(repo);
		const result = await run(['rev-parse', 'no-such-ref']);
		expect(result.ok).toBe(false);
		expect((result.reason ?? '').length).toBeGreaterThan(0);
		expect(result.reason).not.toContain('Command failed:');
	});
});
