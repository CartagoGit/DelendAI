import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	checkWorkflowInvariants,
	renderInvariantReport,
} from '@delendai/core/lib/work-units/workflow-invariants.service';

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
			'HEAD:refs/heads/delendai/pr/claude-opus-5/implement/x1-S1-g1/shaped',
		);
		expect(by(root, 'publications-canonical').holds).toBe(true);
	});

	it('takes the four-component shape the template names for canonical, and the old three for not', () => {
		const { root, remote } = repo();
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/pr/claude-test/x1-S1-g1/before-kind',
		);
		expect(by(root, 'publications-canonical').holds).toBe(false);
		execFileSync(
			'git',
			[
				'update-ref',
				'-d',
				'refs/heads/delendai/pr/claude-test/x1-S1-g1/before-kind',
			],
			{ cwd: remote },
		);
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/pr/claude-test/implement/x1-S1-g1/probe',
		);
		expect(by(root, 'publications-canonical').holds).toBe(true);
	});

	it('does not require the checkout on the integration branch when the profile does not anchor it', () => {
		const { root } = repo();
		git(root, 'switch', '-q', '-c', 'somewhere-else');
		const unanchored = resolveDevelopmentPolicy({
			development: {
				profile: 'worktree-pr',
				branches: {
					namespacePrefix: 'delendai',
					integration: 'develop',
				},
			},
		});
		const result = checkWorkflowInvariants({
			root,
			policy: unanchored,
		}).results.find((each) => each.id === 'checkout-anchored');
		expect(result?.holds).toBe(true);
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

	it('keeps a live unit backed up on the forge, and flags one nobody works on', () => {
		const { root } = repo();
		const live = 'delendai/wip/claude-opus-5/x1-S1-g1/live';
		git(root, 'worktree', 'add', '-q', join(root, 'wt'), '-b', live);
		git(root, 'push', '-q', 'origin', `${live}:refs/heads/${live}`);
		expect(by(root, 'no-remote-work-refs').holds).toBe(true);

		git(root, 'worktree', 'remove', '--force', join(root, 'wt'));
		const result = by(root, 'no-remote-work-refs');
		expect(result.holds).toBe(false);
		expect(result.remedy).toContain('publish');
	});

	it('sees a publication that holds nothing the integration branch lacks', () => {
		const { root } = repo();
		const spent = 'delendai/pr/claude-opus-5/x1-S1-g1/landed';
		git(root, 'push', '-q', 'origin', `HEAD:refs/heads/${spent}`);
		git(root, 'fetch', '-q', 'origin');
		const result = by(root, 'publications-hold-work');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain(spent);

		writeFileSync(join(root, 'c.txt'), 'c\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'work');
		git(root, 'push', '-q', '-f', 'origin', `HEAD:refs/heads/${spent}`);
		git(root, 'reset', '-q', '--hard', 'origin/develop');
		git(root, 'fetch', '-q', 'origin');
		expect(by(root, 'publications-hold-work').holds).toBe(true);
	});

	it('sees a local integration branch holding commits the forge lacks', () => {
		const { root } = repo();
		git(root, 'fetch', '-q', 'origin');
		expect(by(root, 'integration-follows-forge').holds).toBe(true);

		writeFileSync(join(root, 'd.txt'), 'd\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'made in the shared checkout');
		const result = by(root, 'integration-follows-forge');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain('1 commit(s) only here');
		expect(result.remedy).toContain('work enter');
	});

	it('sees a unit kept with nothing in it once the integration branch moved on', () => {
		const { root } = repo();
		const kept = 'delendai/wip/claude-opus-5/x1-S1-g1/kept';
		git(root, 'worktree', 'add', '-q', join(root, 'wt'), '-b', kept);
		// Just entered, level with the integration branch: not idle.
		expect(by(root, 'units-hold-work').holds).toBe(true);

		writeFileSync(join(root, 'e.txt'), 'e\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'develop moves');
		const result = by(root, 'units-hold-work');
		expect(result.holds).toBe(false);
		expect(result.observed).toContain(kept);
		expect(result.remedy).toContain('work retire');

		// A unit with a commit of its own is working, however far behind.
		writeFileSync(join(root, 'wt', 'f.txt'), 'f\n');
		git(join(root, 'wt'), 'add', '-A');
		git(join(root, 'wt'), 'commit', '-q', '-m', 'work');
		expect(by(root, 'units-hold-work').holds).toBe(true);
	});

	it('answers about the shared checkout when a hook in a worktree asks', () => {
		const { root } = repo();
		const wt = `${root}-wt`;
		roots.push(wt);
		git(
			root,
			'worktree',
			'add',
			'-q',
			wt,
			'-b',
			'delendai/wip/claude-opus-5/x1-S1-g1/live',
		);
		writeFileSync(join(wt, 'a.txt'), 'changed in the unit\n');
		// What git exports to a hook running in the worktree.
		const saved = {
			dir: process.env.GIT_DIR,
			index: process.env.GIT_INDEX_FILE,
		};
		process.env.GIT_DIR = git(wt, 'rev-parse', '--absolute-git-dir');
		process.env.GIT_INDEX_FILE = join(process.env.GIT_DIR, 'index');
		try {
			expect(by(root, 'checkout-clean').holds).toBe(true);
			expect(by(root, 'checkout-anchored').observed).toBe('develop');
		} finally {
			if (saved.dir === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = saved.dir;
			if (saved.index === undefined) delete process.env.GIT_INDEX_FILE;
			else process.env.GIT_INDEX_FILE = saved.index;
		}
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
