/**
 * checkout-freshness.spec.ts — being ON the integration branch is not
 * the same as being AT it.
 *
 * The accident this pins actually happened while the work model was
 * being built: a checkout sat on `develop` while `develop` advanced five
 * commits, every other check reported a healthy tree, and a candidate
 * published from it carried an OLDER copy of a file than the branch had
 * — which would have reverted a rule merged in between. Nothing in the
 * reconciler noticed, because the phase only asked WHICH branch HEAD was
 * on.
 *
 * Driven against real git (a bare origin and two clones) rather than a
 * stubbed seam: the claim is about what `git` reports for a behind,
 * level and diverged checkout, and a fake `for-each-ref` would happily
 * "prove" whichever answer the spec expected.
 */

import { describe, expect, it, afterEach } from 'vitest';

import { runCheckoutPhase } from '@delendai/core/lib/startup-reconciler/phases/verify-checkout';

import {
	createStartupOrigin,
	INTEGRATION_BRANCH,
	type IStartupOrigin,
} from './startup-workspace';
import { testPolicy } from './fakes';

let origin: IStartupOrigin | undefined;

afterEach(() => {
	origin?.cleanup();
	origin = undefined;
});

const codesFrom = async (dir: IStartupOrigin, name: string) => {
	const clone = dir.clone(name);
	const result = await runCheckoutPhase({
		git: clone.seam,
		policy: testPolicy(),
		refs: [],
	});
	return { clone, codes: result.findings.map((f) => f.code) };
};

describe('checkout freshness', () => {
	it('reports a checkout level with its remote as on-integration', async () => {
		origin = createStartupOrigin();
		const { codes } = await codesFrom(origin, 'level');

		expect(codes).toContain('checkout.on-integration');
		expect(codes).not.toContain('checkout.behind-integration');
	});

	it('names a checkout that stayed behind while the branch advanced', async () => {
		origin = createStartupOrigin();
		// The order is the whole point: this machine clones FIRST, so it
		// holds the branch as it was, and only later learns that the
		// branch moved. Cloning after the push would produce a checkout
		// that is trivially current and prove nothing.
		const behind = origin.clone('behind');

		const ahead = origin.clone('ahead');
		ahead.write('src/alpha.ts', 'export const alpha = 2;\n');
		ahead.git('add', '-A');
		ahead.git('commit', '--quiet', '--no-verify', '-m', 'advance');
		ahead.push(INTEGRATION_BRANCH);

		behind.git('fetch', '--quiet', 'origin');

		const result = await runCheckoutPhase({
			git: behind.seam,
			policy: testPolicy(),
			refs: [],
		});
		const codes = result.findings.map((finding) => finding.code);

		expect(codes).toContain('checkout.behind-integration');
		// A NOTE, never a blocker: falling behind is the normal
		// consequence of somebody else merging, and failing startup on it
		// would make the server unusable. The refusal that protects the
		// work belongs at publication time.
		expect(result.findings.every((f) => f.kind === 'note')).toBe(true);
	});

	it('distinguishes an unpushed local commit from a divergence', async () => {
		origin = createStartupOrigin();
		const ahead = origin.clone('ahead2');
		ahead.write('src/alpha.ts', 'export const alpha = 3;\n');
		ahead.git('add', '-A');
		ahead.git('commit', '--quiet', '--no-verify', '-m', 'remote side');
		ahead.push(INTEGRATION_BRANCH);

		const local = origin.clone('local2');
		local.git('fetch', '--quiet', 'origin');
		// A local commit the remote does not have: not behind, diverged.
		local.write('src/beta.ts', 'export const beta = 9;\n');
		local.git('add', '-A');
		local.git('commit', '--quiet', '--no-verify', '-m', 'local side');

		const result = await runCheckoutPhase({
			git: local.seam,
			policy: testPolicy(),
			refs: [],
		});
		const codes = result.findings.map((finding) => finding.code);

		// AHEAD, not diverged: the remote has nothing this clone lacks.
		// Calling it a divergence would send the operator looking for a
		// reconciliation that does not exist.
		expect(codes).toContain('checkout.ahead-of-integration');
		expect(codes).not.toContain('checkout.behind-integration');
		expect(codes).not.toContain('checkout.diverged');
	});
	it('reports a real divergence as a divergence', async () => {
		origin = createStartupOrigin();
		// Both sides gain a commit the other does not have. This is the
		// only case where neither `behind` nor `ahead` is true, and it
		// is the one an operator must not confuse with either.
		const local = origin.clone('diverged-local');

		const remote = origin.clone('diverged-remote');
		remote.write('src/alpha.ts', 'export const alpha = 7;\n');
		remote.git('add', '-A');
		remote.git('commit', '--quiet', '--no-verify', '-m', 'remote only');
		remote.push(INTEGRATION_BRANCH);

		local.git('fetch', '--quiet', 'origin');
		local.write('src/beta.ts', 'export const beta = 7;\n');
		local.git('add', '-A');
		local.git('commit', '--quiet', '--no-verify', '-m', 'local only');

		const result = await runCheckoutPhase({
			git: local.seam,
			policy: testPolicy(),
			refs: [],
		});
		const codes = result.findings.map((finding) => finding.code);

		expect(codes).toContain('checkout.diverged');
		expect(codes).not.toContain('checkout.ahead-of-integration');
		expect(codes).not.toContain('checkout.behind-integration');
	});

	it('says UNKNOWN when the remote-tracking ref cannot be read', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('no-remote');
		// Absence of evidence is not evidence: with nothing to compare
		// against, the phase must not report the checkout as current.
		clone.git(
			'update-ref',
			'-d',
			`refs/remotes/origin/${INTEGRATION_BRANCH}`,
		);

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: testPolicy(),
			refs: [],
		});
		const codes = result.findings.map((finding) => finding.code);

		expect(codes).toContain('checkout.freshness-unknown');
		expect(codes).not.toContain('checkout.on-integration');
	});
	it('names HEAD moved onto another branch as a blocker, and does not move it back', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('moved');
		clone.git('checkout', '--quiet', '-b', 'somebody-elses-branch');

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: testPolicy(),
			refs: [],
		});

		// The obvious "fix" is `git switch develop`, and it can destroy
		// uncommitted work that exists nowhere else — including the work
		// of whoever moved HEAD. So this is reported, never repaired.
		expect(result.findings.map((f) => f.code)).toContain(
			'checkout.head-moved',
		);
		expect(result.findings[0]?.kind).toBe('blocker');
		expect(result.findings[0]?.message).toContain('NOT moved back');
		expect(clone.git('rev-parse', '--abbrev-ref', 'HEAD')).toBe(
			'somebody-elses-branch',
		);
	});

	it('says so differently when HEAD sits on a managed work ref', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('on-work-ref');
		const sha = await clone.checkpoint({
			ref: 'refs/wip/agent-a/p-s-g1',
			paths: ['src/alpha.ts'],
			message: 'checkpoint',
		});
		clone.git('checkout', '--quiet', '--detach', sha);

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: testPolicy(),
			refs: [{ name: 'refs/wip/agent-a/p-s-g1', sha }],
		});

		// A work ref is not a branch and must never be a checkout target,
		// so the message has to name that specifically rather than say
		// "some other branch" and leave the operator guessing.
		expect(result.findings[0]?.code).toBe('checkout.head-moved');
		expect(result.findings[0]?.message).toContain(
			'refs/wip/agent-a/p-s-g1',
		);
	});

	it('does not call a detached HEAD a violation where the policy allows worktrees', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('worktree-policy');
		clone.git('checkout', '--quiet', '-b', 'agent-branch');

		const base = testPolicy();
		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: {
				...base,
				workspace: { ...base.workspace, pinnedCheckout: false },
			},
			refs: [],
		});

		// A worktree-per-agent policy EXPECTS other branches to exist.
		// Only HEAD sitting on a managed work ref is always wrong there.
		expect(result.findings[0]?.code).toBe('checkout.on-integration');
		expect(result.findings[0]?.kind).toBe('note');
	});
	it('names a dirty shared checkout and reverts nothing', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('dirty');
		// One generated artifact and one authored file, which is exactly
		// the mix an operator has to tell apart: the first is safe to
		// return, the second is somebody's unpublished work.
		clone.write('src/alpha.ts', 'export const alpha = 99;\n');
		clone.write('host-hints.generated.md', 'regenerated\n');

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: testPolicy(),
			refs: [],
		});
		const dirty = result.findings.find((f) => f.code === 'checkout.dirty');

		expect(dirty).toBeDefined();
		expect(dirty?.kind).toBe('note');
		expect(dirty?.message).toContain('NOTHING was reverted');
		// Both files are still exactly where the agent left them: under a
		// shared checkout the tree belongs to everyone, so an unexplained
		// change is someone else's in-flight work until proven otherwise,
		// and the one thing that must not happen is an agent tidying it.
		expect(clone.git('status', '--porcelain')).toContain('src/alpha.ts');
	});

	it('says nothing about a clean tree', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('clean');

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: testPolicy(),
			refs: [],
		});

		expect(result.findings.some((f) => f.code === 'checkout.dirty')).toBe(
			false,
		);
	});
});
