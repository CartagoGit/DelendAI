/**
 * A reaper is judged by what it refuses to delete.
 *
 * There is exactly one verdict that permits a deletion, and every case
 * below exists to keep some branch out of it. The ordering cases matter
 * most: each checks that an earlier reason to KEEP a branch wins over a
 * later reason to reap it, because that is what stops a single wrong
 * observation — a stale remote list, a missed worktree — from being
 * enough to lose work on its own.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	classifyLocal,
	isLiveOnRemote,
	reclaimLocal,
} from './reclaim-local.script';
import type { ILocalBranch } from './reclaim-local.interface';

const branch = (over: Partial<ILocalBranch> = {}): ILocalBranch => ({
	name: 'delendai/pr/whatever',
	unpublished: 0,
	liveOnRemote: false,
	checkedOut: false,
	...over,
});

describe('classifyLocal — the one case that permits deletion', () => {
	it('reaps a branch that is fully published and gone from the remote', () => {
		expect(classifyLocal(branch()).role).toBe('spent-mirror');
	});
});

describe('classifyLocal — every reason to keep a branch', () => {
	it('never touches the integration branch', () => {
		expect(classifyLocal(branch({ name: 'develop' })).role).toBe(
			'protected',
		);
	});

	it('never touches the release branch', () => {
		expect(classifyLocal(branch({ name: 'main' })).role).toBe('protected');
	});

	it('keeps a branch carrying a commit no remote has', () => {
		expect(classifyLocal(branch({ unpublished: 1 })).role).toBe(
			'local-only-work',
		);
	});

	it('keeps a branch a worktree is holding', () => {
		expect(classifyLocal(branch({ checkedOut: true })).role).toBe('in-use');
	});

	it('keeps a branch whose remote counterpart is still there', () => {
		expect(classifyLocal(branch({ liveOnRemote: true })).role).toBe(
			'live-mirror',
		);
	});
});

describe('classifyLocal — a reason to keep always beats a reason to reap', () => {
	// Each of these looks reapable on the evidence the LAST rule reads.
	it('protects a policy branch even when it looks spent', () => {
		expect(
			classifyLocal(
				branch({
					name: 'develop',
					unpublished: 0,
					liveOnRemote: false,
				}),
			).role,
		).toBe('protected');
	});

	it('keeps unpublished work even when the remote counterpart is gone', () => {
		expect(
			classifyLocal(branch({ unpublished: 3, liveOnRemote: false })).role,
		).toBe('local-only-work');
	});

	it('keeps unpublished work even when a worktree also holds it', () => {
		expect(
			classifyLocal(branch({ unpublished: 3, checkedOut: true })).role,
		).toBe('local-only-work');
	});

	it('keeps a checked-out branch even when it is fully published', () => {
		expect(
			classifyLocal(branch({ unpublished: 0, checkedOut: true })).role,
		).toBe('in-use');
	});

	// A caller may narrow the protected list; it may never empty the
	// floor that keeps `main` out of reach.
	it('protects the default names even when the config declares others', () => {
		expect(
			classifyLocal(branch({ name: 'main' }), ['develop', 'main']).role,
		).toBe('protected');
	});
});

describe('reclaimLocal', () => {
	it('puts only the spent mirrors in reapable', () => {
		const report = reclaimLocal([
			branch({ name: 'delendai/pr/done' }),
			branch({ name: 'delendai/pr/live', liveOnRemote: true }),
			branch({ name: 'delendai/pr/mine', unpublished: 2 }),
			branch({ name: 'develop' }),
		]);
		expect(report.reapable.map((each) => each.name)).toEqual([
			'delendai/pr/done',
		]);
	});

	it('reports unpublished work separately so it is visible, not silent', () => {
		const report = reclaimLocal([branch({ name: 'x', unpublished: 2 })]);
		expect(report.unpublished.map((each) => each.name)).toEqual(['x']);
		expect(report.reapable).toEqual([]);
	});

	it('gives every verdict a reason naming the evidence', () => {
		for (const verdict of reclaimLocal([
			branch(),
			branch({ name: 'develop' }),
		]).verdicts) {
			expect(verdict.reason.length).toBeGreaterThan(20);
		}
	});
});

/**
 * The Codex lesson, pinned where it cannot be argued with.
 *
 * The reaper must not merely decline to delete refs belonging to other
 * tools — it must never be able to SEE one. A ref that reaches the
 * candidate list is a ref some future branch of this code can act on,
 * and "it is filtered out later" is a property that survives exactly
 * until someone edits the filter.
 *
 * So this reads the source and asserts the enumeration itself is
 * narrow. It is a structural test on purpose: the behavioural version
 * would have to create a `refs/codex/…` ref to prove a negative, and
 * failing that test would mean the damage had already been done.
 */
/**
 * Liveness by upstream, because the obvious implementation is wrong in
 * the direction that loses work.
 *
 * Matching by NAME reads a branch published under a different name as
 * abandoned and reaps it while its pull request is open. Found by
 * pointing a local `delendai/pr/viva` at a live
 * `origin/delendai/pr/test-zones`: the name check said gone, and the
 * branch was one `--apply` away from being deleted.
 */
describe('isLiveOnRemote', () => {
	it('is live while the upstream exists, whatever the branch is called', () => {
		expect(
			isLiveOnRemote({
				upstream: 'origin/delendai/pr/other-name',
				track: '',
				sameNameExists: false,
			}),
		).toBe(true);
	});

	it('is not live once git reports the upstream gone', () => {
		expect(
			isLiveOnRemote({
				upstream: 'origin/delendai/pr/x',
				track: '[gone]',
				sameNameExists: false,
			}),
		).toBe(false);
	});

	it('stays live while merely behind or ahead', () => {
		expect(
			isLiveOnRemote({
				upstream: 'origin/x',
				track: '[ahead 2, behind 3]',
				sameNameExists: false,
			}),
		).toBe(true);
	});

	it('falls back to the name only when there is no upstream at all', () => {
		expect(
			isLiveOnRemote({ upstream: '', track: '', sameNameExists: true }),
		).toBe(true);
		expect(
			isLiveOnRemote({ upstream: '', track: '', sameNameExists: false }),
		).toBe(false);
	});

	// The upstream is the authority: a same-named remote branch must
	// not resurrect a branch whose own upstream git says is gone.
	it('does not let a same-named remote override a gone upstream', () => {
		expect(
			isLiveOnRemote({
				upstream: 'origin/x',
				track: '[gone]',
				sameNameExists: true,
			}),
		).toBe(false);
	});
});

describe('what the reaper is able to observe at all', () => {
	// Comments are stripped first: this is a claim about what the code
	// reaches for, and the file's prose deliberately NAMES the
	// namespaces it must not touch. A test that could not tell those
	// apart would force the explanation to be deleted to stay green.
	const code = readFileSync(
		join(__dirname, 'reclaim-local.script.ts'),
		'utf8',
	)
		.replace(/\/\*[\s\S]*?\*\//gu, '')
		.replace(/^\s*\/\/.*$/gmu, '');

	it('enumerates only refs/heads and refs/remotes', () => {
		// `refs/remotes` is read to learn what is still live on the
		// forge; it is never a deletion target.
		const enumerations = new Set(
			[...code.matchAll(/'refs\/[a-z]+\/?'/gu)].map((match) => match[0]),
		);
		expect(enumerations).toEqual(
			new Set(["'refs/heads/'", "'refs/remotes/'"]),
		);
	});

	it('does not reach for any other tool ref namespace', () => {
		expect(code).not.toMatch(/refs\/(stash|codex|notes|bisect)/u);
	});

	it('deletes through `git branch -D`, never through plumbing', () => {
		// `branch -D` cannot address anything outside refs/heads.
		// `update-ref -d` can address every ref in the repository, which
		// is exactly the reach this tool must not have — it is how a
		// checkpoint ref belonging to another tool got deleted by hand.
		expect(code).toContain("'branch', '-D'");
		expect(code).not.toContain('update-ref');
	});
});
