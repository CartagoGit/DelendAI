/**
 * What a refresher is allowed to touch, and what it must hand back.
 *
 * The CI job used to do this with the forge's `update-branch` API, which
 * writes a bot commit — and the forge will not build a bot commit, it
 * parks the runs as `action_required`. Twenty-one parked runs across
 * five pull requests came from that, each one BLOCKED with nothing red
 * on it. So refreshing moved to the machine that owns the candidate, and
 * these cases pin the two boundaries that keep it safe: it only touches
 * its own namespace, and it never attempts a merge it cannot do
 * trivially.
 */

import { describe, expect, it } from 'vitest';

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
