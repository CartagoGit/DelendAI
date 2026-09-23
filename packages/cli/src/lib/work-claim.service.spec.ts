/**
 * A unit of work changes hands by changing its name.
 *
 * Driven against a real git repository, because the claim is about refs
 * and the only authority on refs is git.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import {
	applyWorkClaim,
	claimableWorkRefs,
	planWorkClaim,
} from './work-claim.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const policy = fakePartial<IResolvedDevelopmentPolicy>({
	branches: fakePartial<IResolvedDevelopmentPolicy['branches']>({
		integration: 'develop',
		workRefPrefix: 'delendai/wip/',
		// The shape is READ from the template now, not from a constant
		// this fixture could contradict: a policy that names no template
		// names no work refs, so a claim has nothing to read.
		workRefTemplate:
			'delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}',
	}),
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-claim-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync(
		'git',
		[
			'-c',
			'user.email=t@t',
			'-c',
			'user.name=t',
			'commit',
			'-q',
			'-m',
			'base',
		],
		{ cwd: root },
	);
	return root;
};

const at = (root: string, ref: string): string =>
	execFileSync('git', ['rev-parse', ref], {
		cwd: root,
		encoding: 'utf8',
	}).trim();

const exists = (root: string, ref: string): boolean => {
	try {
		execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			cwd: root,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
};

describe('planWorkClaim', () => {
	it('renames to the taking agent and bumps the generation', () => {
		// The real case: codex left
		// `delendai/wip/codex-astra-6/f00551-S0-g1/work` behind and
		// somebody else finished it. Until it was renamed, the swarm view
		// reported codex as the owner of work codex was not doing.
		const planned = planWorkClaim({
			ref: 'delendai/wip/codex-astra-6/f00551-S0-g1/batuta-registration',
			sha: 'a'.repeat(40),
			agent: 'claude-opus-5',
			policy,
		});
		expect(planned).toEqual({
			from: 'delendai/wip/codex-astra-6/f00551-S0-g1/batuta-registration',
			to: 'delendai/wip/claude-opus-5/f00551-S0-g2/batuta-registration',
			heldBy: 'codex-astra-6',
			claimedBy: 'claude-opus-5',
			sha: 'a'.repeat(40),
			generation: 2,
		});
	});

	it('refuses a ref that is already yours', () => {
		const planned = planWorkClaim({
			ref: 'delendai/wip/me/x00001-S1-g1/topic',
			sha: 'b'.repeat(40),
			agent: 'me',
			policy,
		});
		expect(planned).toHaveProperty('reason');
		expect(JSON.stringify(planned)).toContain('already yours');
	});

	it('refuses when there is no identity to name it after', () => {
		const planned = planWorkClaim({
			ref: 'delendai/wip/them/x00001-S1-g1/topic',
			sha: 'c'.repeat(40),
			agent: '',
			policy,
		});
		expect(JSON.stringify(planned)).toContain('DELENDAI_AGENT_ID');
	});

	it('refuses a ref outside this project’s work-ref space', () => {
		const planned = planWorkClaim({
			ref: 'feature/something',
			sha: 'd'.repeat(40),
			agent: 'me',
			policy,
		});
		expect(JSON.stringify(planned)).toContain('not a work ref');
	});

	it('refuses to guess at a subject it cannot read', () => {
		// The non-canonical name codex actually produced. Renaming it into
		// the shape would mean guessing which slice it is about, and a
		// wrong guess produces a ref claiming work it is not.
		const planned = planWorkClaim({
			ref: 'delendai/wip/codex-batuta-orchestrator/work',
			sha: 'e'.repeat(40),
			agent: 'me',
			policy,
		});
		expect(JSON.stringify(planned)).toContain('no honest new name');
	});
});

describe('applyWorkClaim', () => {
	it('moves the name and not the commit', () => {
		const root = repo();
		const from = 'delendai/wip/other/x00001-S1-g1/topic';
		const sha = at(root, 'HEAD');
		execFileSync('git', ['update-ref', `refs/heads/${from}`, sha], {
			cwd: root,
		});

		const planned = planWorkClaim({
			ref: from,
			sha,
			agent: 'mine',
			policy,
		});
		if (!('to' in planned)) throw new Error('unreachable');
		const result = applyWorkClaim(root, planned);

		expect(result).toHaveProperty('to');
		expect(
			at(root, 'refs/heads/delendai/wip/mine/x00001-S1-g2/topic'),
		).toBe(sha);
		expect(exists(root, `refs/heads/${from}`)).toBe(false);
	});

	it('lists what somebody else holds, and nothing of yours', () => {
		const root = repo();
		const sha = at(root, 'HEAD');
		for (const ref of [
			'delendai/wip/other/x00001-S1-g1/topic',
			'delendai/wip/third/x00002-S2-g3/other-topic',
			'delendai/wip/mine/x00003-S1-g1/already-mine',
		]) {
			execFileSync('git', ['update-ref', `refs/heads/${ref}`, sha], {
				cwd: root,
			});
		}

		const claimable = claimableWorkRefs({ root, agent: 'mine', policy });

		expect(claimable.map((claim) => claim.to).sort()).toEqual([
			'delendai/wip/mine/x00001-S1-g2/topic',
			'delendai/wip/mine/x00002-S2-g4/other-topic',
		]);
	});
});

describe('applyWorkClaim refuses without losing anything', () => {
	it('reports a name git will not take, and leaves the old ref standing', () => {
		// The ordering is the safety: create, prove, then delete. If the
		// creation fails there is nothing to undo.
		const root = repo();
		const from = 'delendai/wip/other/x00001-S1-g1/topic';
		const sha = at(root, 'HEAD');
		execFileSync('git', ['update-ref', `refs/heads/${from}`, sha], {
			cwd: root,
		});

		const result = applyWorkClaim(root, {
			from,
			// `..` is not a legal ref component; git refuses it outright.
			to: 'delendai/wip/mine/../escape',
			heldBy: 'other',
			claimedBy: 'mine',
			sha,
			generation: 2,
		});

		expect(result).toHaveProperty('reason');
		expect(JSON.stringify(result)).toContain('could not create');
		expect(exists(root, `refs/heads/${from}`)).toBe(true);
	});

	it('refuses when the new name does not hold the commit it was given', () => {
		// The proof between the create and the delete. It cannot normally
		// fail, which is exactly why it must be checked: the delete that
		// follows it is the irreversible half.
		const root = repo();
		const from = 'delendai/wip/other/x00001-S1-g1/topic';
		const sha = at(root, 'HEAD');
		execFileSync('git', ['update-ref', `refs/heads/${from}`, sha], {
			cwd: root,
		});

		const result = applyWorkClaim(root, {
			from,
			to: 'delendai/wip/mine/x00001-S1-g2/topic',
			heldBy: 'other',
			claimedBy: 'mine',
			// A commit this repository does not have: `update-ref`
			// succeeds against the object store it is given and the
			// read-back cannot match.
			sha: '0'.repeat(40),
			generation: 2,
		});

		expect(result).toHaveProperty('reason');
		expect(exists(root, `refs/heads/${from}`)).toBe(true);
	});

	it('says so when the old name survives the deletion, because nothing is lost', () => {
		// Both names then point at the work. Untidy, not a loss — so it
		// is reported rather than repaired blindly.
		const root = repo();
		const from = 'delendai/wip/other/x00001-S1-g1/topic';
		const sha = at(root, 'HEAD');
		execFileSync('git', ['update-ref', `refs/heads/${from}`, sha], {
			cwd: root,
		});
		// A second commit, so the delete's expected-value guard fails.
		writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		execFileSync(
			'git',
			[
				'-c',
				'user.email=t@t',
				'-c',
				'user.name=t',
				'commit',
				'-q',
				'-m',
				'second',
			],
			{ cwd: root },
		);
		const moved = at(root, 'HEAD');
		execFileSync('git', ['update-ref', `refs/heads/${from}`, moved], {
			cwd: root,
		});

		const result = applyWorkClaim(root, {
			from,
			to: 'delendai/wip/mine/x00001-S1-g2/topic',
			heldBy: 'other',
			claimedBy: 'mine',
			// Stale: what the planner saw before the other agent moved it.
			sha,
			generation: 2,
		});

		expect(JSON.stringify(result)).toContain('could not be removed');
		// Neither name lost the work.
		expect(exists(root, `refs/heads/${from}`)).toBe(true);
		expect(
			at(root, 'refs/heads/delendai/wip/mine/x00001-S1-g2/topic'),
		).toBe(sha);
	});
});
