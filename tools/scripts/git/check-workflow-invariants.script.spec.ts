import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	checkWorkflowInvariants,
	renderInvariantReport,
} from './check-workflow-invariants.script';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai', integration: 'develop' },
	},
});

/** A pinned checkout with a bare remote, both empty of work. */
const repo = (): { root: string; remote: string } => {
	const remote = mkdtempSync(join(tmpdir(), 'inv-remote-'));
	const root = mkdtempSync(join(tmpdir(), 'inv-'));
	roots.push(remote, root);
	git(remote, 'init', '-q', '--bare', '-b', 'develop');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'i@example.invalid');
	git(root, 'config', 'user.name', 'I');
	git(root, 'config', 'commit.gpgsign', 'false');
	git(root, 'remote', 'add', 'origin', remote);
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'push', '-q', 'origin', 'develop');
	return { root, remote };
};

const check = (root: string) => checkWorkflowInvariants({ root, policy });
const by = (root: string, id: string) => {
	const hit = check(root).results.find((r) => r.id === id);
	if (hit === undefined) throw new Error(`no invariant ${id}`);
	return hit;
};

describe('workflow invariants (x00573)', () => {
	it('holds on a checkout that is doing nothing wrong', () => {
		const { root } = repo();
		const report = check(root);
		expect(report.broken).toBe(0);
		expect(report.results.length).toBeGreaterThanOrEqual(7);
	});

	it('sees a modification in the shared checkout', () => {
		const { root } = repo();
		writeFileSync(join(root, 'a.txt'), 'changed\n');
		expect(by(root, 'checkout-clean').holds).toBe(false);
		// Staged, too — the shape that actually kept appearing.
		git(root, 'add', '-A');
		const staged = by(root, 'checkout-clean');
		expect(staged.holds).toBe(false);
		expect(staged.observed).toContain('a.txt');
	});

	it('sees a checkout that left the integration node', () => {
		const { root } = repo();
		git(root, 'switch', '-q', '-c', 'somewhere-else');
		const result = by(root, 'checkout-anchored');
		expect(result.holds).toBe(false);
		expect(result.observed).toBe('somewhere-else');
		expect(result.remedy).toContain('develop');
	});

	it('accepts a work ref a worktree is working on, and refuses one nobody is', () => {
		const { root } = repo();
		const live = 'delendai/wip/claude-opus-5/x1-S1-g1/live';
		git(root, 'worktree', 'add', '-q', join(root, 'wt'), '-b', live);
		expect(by(root, 'no-abandoned-work-refs').holds).toBe(true);

		git(root, 'branch', 'delendai/wip/claude-opus-5/x2-S1-g1/abandoned');
		const result = by(root, 'no-abandoned-work-refs');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain('abandoned');
	});

	it('refuses a worktree that is not standing on a work ref', () => {
		const { root } = repo();
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'stray'),
			'-b',
			'feature',
		);
		const result = by(root, 'no-leftover-worktrees');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain('stray');
	});

	it('refuses a publication ref with no agent, slice or generation in it', () => {
		const { root, remote } = repo();
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/pr/flat-name',
		);
		const flat = by(root, 'publications-canonical');
		expect(flat.holds).toBe(false);
		expect(flat.observed).toContain('flat-name');

		execFileSync(
			'git',
			['update-ref', '-d', 'refs/heads/delendai/pr/flat-name'],
			{ cwd: remote },
		);
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/pr/claude-opus-5/x1-S1-g1/shaped',
		);
		expect(by(root, 'publications-canonical').holds).toBe(true);
	});

	it('sees a candidate that does not contain the integration branch', () => {
		const { root } = repo();
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/pr/claude-opus-5/x1-S1-g1/behind',
		);
		writeFileSync(join(root, 'b.txt'), 'b\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'moves develop');
		git(root, 'push', '-q', 'origin', 'develop');
		git(root, 'fetch', '-q', 'origin');
		const result = by(root, 'candidates-hydrated');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain('behind');
		expect(result.remedy).toContain('forge:refresh');
	});

	it('sees a work ref that outlived its publication on the forge', () => {
		const { root } = repo();
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/wip/claude-opus-5/x1-S1-g1/left-behind',
		);
		expect(by(root, 'no-remote-work-refs').holds).toBe(false);
	});

	it('reports what it observed even when the invariant holds', () => {
		// A check that only speaks when it fails cannot be trusted to have
		// looked at anything.
		const { root } = repo();
		for (const result of check(root).results) {
			expect(result.observed.length).toBeGreaterThan(0);
		}
	});

	it('renders one screen naming every broken promise and its fix', () => {
		const { root } = repo();
		git(root, 'switch', '-q', '-c', 'wandered');
		const text = renderInvariantReport(check(root));
		expect(text).toContain('BROKEN');
		expect(text).toContain('checkout-anchored');
		expect(text).toContain('fix:');
	});
});
