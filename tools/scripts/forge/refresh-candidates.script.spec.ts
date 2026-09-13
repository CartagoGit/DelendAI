/**
 * What a refresher is allowed to touch, and what it must hand back.
 *
 * The CI job used to do this with the forge's `update-branch` API, which
 * writes a bot commit — and the forge will not build a bot commit, it
 * parks the runs as `action_required`. Twenty-one parked runs across
 * five pull requests came from that, each one BLOCKED with nothing red
 * on it. So refreshing moved to the machine that owns the candidate, and
 * these cases pin the boundaries that keep it safe: it only touches its
 * own namespace — as the RESOLVER defines that namespace, not as a raw
 * config read guesses at it — it merges in a throwaway worktree so the
 * shared checkout never moves, and it reports a conflict rather than
 * guessing at the author's intent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

import { planRefresh } from './refresh-candidates.script';
import type { ICandidate } from './refresh-candidates.interface';

const candidate = (over: Partial<ICandidate> = {}): ICandidate => ({
	ref: 'delendai/pr/whatever',
	ours: true,
	behind: 3,
	conflicted: false,
	...over,
});

describe('planRefresh', () => {
	it('refreshes one of ours that is behind and merges cleanly', () => {
		expect(planRefresh(candidate()).action).toBe('refresh');
	});

	// Dependabot's branches are not ours to rewrite, whatever state they
	// are in.
	it('skips a ref outside the publication namespace', () => {
		expect(planRefresh(candidate({ ours: false, behind: 9 })).action).toBe(
			'skip',
		);
	});

	it('skips one that already contains the integration head', () => {
		expect(planRefresh(candidate({ behind: 0 })).action).toBe('skip');
	});

	// Reported, never attempted: resolving a conflict is a judgement
	// about what the author meant, and a tool that guesses at intent is
	// why nobody trusts tools with git.
	it('reports a conflict instead of attempting it', () => {
		const verdict = planRefresh(candidate({ conflicted: true }));
		expect(verdict.action).toBe('report');
		expect(verdict.reason).toContain("author's call");
	});

	it('names the ref in every verdict', () => {
		for (const over of [
			{},
			{ ours: false },
			{ behind: 0 },
			{ conflicted: true },
		]) {
			expect(planRefresh(candidate(over)).reason).toContain(
				'delendai/pr/whatever',
			);
		}
	});

	// A conflict on something that is not ours is still not ours.
	it('lets namespace win over every other consideration', () => {
		expect(
			planRefresh(candidate({ ours: false, conflicted: true })).action,
		).toBe('skip');
	});
});

describe('the refresher itself', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/refresh-candidates.script.ts'),
		'utf8',
	);
	// Comments are where the rejected approaches are explained, so a
	// structural assertion has to read the code and not the prose that
	// names what the code stopped doing.
	const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');

	it('asks the resolver what a publication ref is', () => {
		// It used to read `delendai.config.json` directly and fall back
		// to `delendai/` when no `publicationRefPrefix` was written
		// there — which is the case here, because this repository names
		// a profile and lets the profile supply the branches. The
		// resolved prefix is `delendai/pr/`, strictly narrower, so the
		// fallback made the refresher claim `delendai/wip/*` work refs
		// and `delendai/merge/*` refs as its own.
		expect(code).toContain('resolveDevelopmentPolicy');
		expect(code).not.toContain("?? 'delendai/'");
	});

	it('uses git’s real merge, not its trivial one', () => {
		// `read-tree -m --aggressive` reported `.github/workflows/ci.yml`
		// and `package.json` as conflicts on a candidate `git merge`
		// then resolved cleanly with no human input. A refresher that
		// cries conflict on merges git can do costs exactly the
		// attention it exists to save.
		expect(code).not.toContain('--aggressive');
		expect(code).toContain("'merge'");
	});

	it('never merges inside the shared checkout', () => {
		// The whole point is that this can run while somebody else is
		// editing. A merge in the shared tree would move their HEAD and
		// touch their files.
		expect(code).toContain("'worktree', 'add', '--detach'");
		expect(code).toContain("'worktree', 'prune'");
	});
});
