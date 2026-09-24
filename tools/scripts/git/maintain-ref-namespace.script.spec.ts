/**
 * maintain-ref-namespace.script.spec.ts — the namespace keeps itself in
 * shape, and never at the cost of somebody's work.
 *
 * Driven against a real repository: every claim here is about what git
 * reports for refs in particular states, and a stubbed runner would
 * happily "prove" whichever answer the spec expected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	captureWorkingState,
	workingStateChanges,
} from '@delendai/test-kit/public';

import {
	canonicalNameFor,
	checkedOutRefs,
	isSpent,
	maintainRefNamespace,
	reap,
	refsUnder,
} from './maintain-ref-namespace.script';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A clone with a bare remote, on `develop`, with one commit. */
const repo = (): { readonly root: string; readonly remote: string } => {
	const base = mkdtempSync(join(tmpdir(), 'ref-namespace-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'work');
	execFileSync('mkdir', ['-p', remote, root]);
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'ns@example.com');
	git(root, 'config', 'user.name', 'NS');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return { root, remote };
};

/** A ref carrying one commit of its own. */
const workRef = (root: string, name: string, file: string): string => {
	const tree = git(root, 'rev-parse', 'HEAD^{tree}');
	const head = git(root, 'rev-parse', 'HEAD');
	writeFileSync(join(root, file), `export const x = 1;\n`);
	git(root, 'add', file);
	const written = git(root, 'write-tree');
	git(root, 'reset', '-q', 'HEAD', '--', file);
	rmSync(join(root, file));
	expect(written).not.toBe(tree);
	const commit = git(root, 'commit-tree', written, '-p', head, '-m', name);
	git(root, 'update-ref', `refs/heads/${name}`, commit);
	git(root, 'push', '-q', 'origin', `refs/heads/${name}:refs/heads/${name}`);
	return commit;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('canonicalNameFor (x00564)', () => {
	it('names what a dash-shaped ref should be called', () => {
		expect(
			canonicalNameFor(
				policy,
				'delendai/wip/claude-opus-5/x00564-S1-g1-some-topic',
			),
		).toBe('delendai/wip/claude-opus-5/x00564-S1-g1/some-topic');
	});

	it('says nothing about a ref that already carries the shape', () => {
		expect(
			canonicalNameFor(
				policy,
				'delendai/wip/claude-opus-5/x00564-S1-g1/some-topic',
			),
		).toBeUndefined();
	});

	it('refuses to guess a name it cannot read', () => {
		// A rename that invents an identity is worse than an ugly name.
		expect(
			canonicalNameFor(policy, 'delendai/wip/claude-opus-5/whatever'),
		).toBeUndefined();
	});
});

describe('isSpent (x00564)', () => {
	it('is true only when the branch contains everything the ref adds', () => {
		const { root } = repo();
		const landed = workRef(root, 'delendai/wip/a/x1-S1-g1/landed', 'b.ts');
		expect(isSpent(root, 'refs/remotes/origin/develop', landed)).toBe(
			false,
		);
		// Land it the way a forge lands a pull request — a merge commit,
		// so the branch moves PAST the ref rather than onto it.
		git(root, 'merge', '--no-edit', '--no-ff', '-q', landed);
		git(root, 'push', '-q', 'origin', 'develop');
		git(root, 'fetch', '-q', 'origin');
		expect(isSpent(root, 'refs/remotes/origin/develop', landed)).toBe(true);
	});

	it('is false for a ref sitting exactly at the integration tip', () => {
		// Indistinguishable, by sha alone, from a unit of work that has
		// not checkpointed yet — so neither is ever reaped. Age is not
		// evidence here, and deleting the live one is unrecoverable.
		// It sits AT the integration tip, so "adds nothing" is true of it
		// — and reaping it would delete the ref an agent is working in.
		const { root } = repo();
		const tip = git(root, 'rev-parse', 'refs/remotes/origin/develop');
		expect(isSpent(root, 'refs/remotes/origin/develop', tip)).toBe(false);
	});
});

describe('maintainRefNamespace (x00564)', () => {
	it('renames a ref that does not carry the shape, keeping its commit', () => {
		const { root } = repo();
		const sha = workRef(
			root,
			'delendai/wip/claude-opus-5/x00564-S1-g1-dash-shaped',
			'c.ts',
		);
		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		expect(
			report.actions.find((action) => action.kind === 'rename')?.applied,
		).toBe(true);
		expect(
			git(
				root,
				'rev-parse',
				'refs/heads/delendai/wip/claude-opus-5/x00564-S1-g1/dash-shaped',
			),
		).toBe(sha);
		expect(() =>
			git(
				root,
				'rev-parse',
				'--verify',
				'refs/heads/delendai/wip/claude-opus-5/x00564-S1-g1-dash-shaped',
			),
		).toThrow();
	});

	it('reaps only what the integration branch already contains', () => {
		const { root } = repo();
		const landed = workRef(root, 'delendai/wip/a/x1-S1-g1/landed', 'd.ts');
		workRef(root, 'delendai/wip/a/x2-S1-g1/live', 'e.ts');
		git(root, 'merge', '--no-edit', '--no-ff', '-q', landed);
		git(root, 'push', '-q', 'origin', 'develop');
		git(root, 'fetch', '-q', 'origin');

		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		const reaped = report.actions.filter(
			(action) => action.kind === 'reap',
		);
		expect(reaped.map((action) => action.ref)).toEqual([
			'delendai/wip/a/x1-S1-g1/landed',
		]);
		// The one carrying work is still here, under its own name.
		expect(
			git(root, 'rev-parse', 'refs/heads/delendai/wip/a/x2-S1-g1/live'),
		).not.toBe('');
	});

	it('never touches a ref a worktree has checked out', () => {
		const { root } = repo();
		const name = 'delendai/wip/a/x3-S1-g1-being-worked-on';
		workRef(root, name, 'f.ts');
		git(root, 'worktree', 'add', '-q', join(root, 'wt'), name);

		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		const action = report.actions.find((entry) => entry.ref === name);
		expect(action).toMatchObject({ kind: 'left-alone', applied: false });
		expect(action?.detail).toContain('checked out');
		// Still there, still dash-shaped, still somebody's.
		expect(git(root, 'rev-parse', `refs/heads/${name}`)).not.toBe('');
		expect(checkedOutRefs(root).has(name)).toBe(true);
	});

	it('keeps the uncommitted work of the checkout it runs in (x00635)', () => {
		const { root } = repo();
		workRef(root, 'delendai/wip/a/x9-S1-g1-dash', 'h.ts');
		writeFileSync(join(root, 'a.ts'), 'export const a = 5;\n');
		writeFileSync(join(root, 'loose.txt'), 'untracked\n');
		const before = captureWorkingState(root);
		maintainRefNamespace({ root, policy, remote: 'origin', apply: true });
		expect(workingStateChanges(before)).toEqual([]);
	});

	/**
	 * A branch published, merged, and deleted on the forge, still checked
	 * out in a linked worktree: what left merged branches in every clone.
	 */
	const mergedAndGone = (root: string, name: string, dir: string) => {
		const sha = workRef(root, name, 'merged.ts');
		git(root, 'branch', '-q', `--set-upstream-to=origin/${name}`, name);
		// The integration branch takes the work in a merge commit past it,
		// and the forge deletes the ref.
		const merge = git(
			root,
			'commit-tree',
			`${sha}^{tree}`,
			'-p',
			git(root, 'rev-parse', 'HEAD'),
			'-p',
			sha,
			'-m',
			'merge',
		);
		git(root, 'push', '-q', 'origin', `${merge}:refs/heads/develop`);
		git(root, 'push', '-q', 'origin', '--delete', name);
		git(root, 'fetch', '-q', '--prune', 'origin');
		git(root, 'worktree', 'add', '-q', join(root, dir), name);
		return sha;
	};

	it('removes a clean worktree standing on merged work, and the ref with it', () => {
		const { root } = repo();
		const name = 'delendai/pr/a/x6-S1-g1/merged';
		mergedAndGone(root, name, 'wt-merged');

		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		expect(report.actions.find((a) => a.ref === name)).toMatchObject({
			kind: 'reap',
			applied: true,
		});
		expect(checkedOutRefs(root).has(name)).toBe(false);
		expect(() =>
			git(root, 'rev-parse', '--verify', `refs/heads/${name}`),
		).toThrow();
	});

	it('keeps a worktree on merged work that still has changes', () => {
		const { root } = repo();
		const name = 'delendai/pr/a/x7-S1-g1/merged-but-dirty';
		mergedAndGone(root, name, 'wt-dirty');
		writeFileSync(join(root, 'wt-dirty', 'unsaved.ts'), 'export {};\n');

		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		expect(report.actions.find((a) => a.ref === name)).toMatchObject({
			kind: 'left-alone',
			applied: false,
		});
		expect(checkedOutRefs(root).has(name)).toBe(true);
	});

	it('never removes the worktree of a ref that was never published', () => {
		// An agent that has just entered: its ref sits on older integration
		// history with no commits yet, but it was never pushed.
		const { root } = repo();
		const name = 'delendai/wip/a/x8-S1-g1/just-entered';
		git(root, 'branch', name);
		writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'develop moves on');
		git(root, 'push', '-q', 'origin', 'develop');
		git(root, 'fetch', '-q', 'origin');
		git(root, 'worktree', 'add', '-q', join(root, 'wt-new'), name);

		maintainRefNamespace({ root, policy, remote: 'origin', apply: true });
		expect(checkedOutRefs(root).has(name)).toBe(true);
	});

	it('changes nothing in a read-only run', () => {
		const { root } = repo();
		const name = 'delendai/wip/a/x4-S1-g1-dash';
		const sha = workRef(root, name, 'g.ts');
		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: false,
		});
		expect(report.actions.every((action) => !action.applied)).toBe(true);
		expect(git(root, 'rev-parse', `refs/heads/${name}`)).toBe(sha);
	});
});

describe('a rename never costs the work it renames (x00564)', () => {
	it('keeps the old name when the remote refuses the new one', () => {
		// The failure path the tests did not cover: push the new name,
		// delete the old one, and assume the push. A forge that refuses
		// the new name — a ref rule, a protected pattern, a dropped
		// connection — and accepts the delete would leave the work
		// reachable from no clone at all.
		const { root, remote } = repo();
		const sha = git(root, 'rev-parse', 'HEAD');
		const from = 'delendai/wip/desktop-abc/x1-S1-g1/old-name';
		git(root, 'branch', from, sha);
		git(
			root,
			'push',
			'-q',
			'origin',
			`refs/heads/${from}:refs/heads/${from}`,
		);

		// A remote that accepts nothing new: point the clone at a path
		// that is not a repository, so every push fails.
		git(root, 'remote', 'set-url', 'origin', join(remote, 'gone'));
		const report = maintainRefNamespace({
			root,
			policy,
			remote: 'origin',
			apply: true,
		});
		const renames = report.actions.filter((a) => a.kind === 'rename');
		for (const action of renames) expect(action.applied).toBe(false);

		// And the work is still reachable under the name it had.
		git(root, 'remote', 'set-url', 'origin', remote);
		expect(
			git(root, 'ls-remote', 'origin', `refs/heads/${from}`),
		).toContain(sha);
	});
});

describe('the remote is the authority for a shared ref (x00581)', () => {
	it('reads the remote sha, not the stale local one', () => {
		// `for-each-ref` lists heads before remotes, and the old reading
		// kept whichever it saw first — so a local copy that had not been
		// fetched since always won, including when it was behind.
		const { root } = repo();
		const name = 'delendai/wip/claude-opus-5/x1-S1-g1/diverged';
		const old = git(root, 'rev-parse', 'HEAD');
		git(root, 'branch', name, old);
		git(
			root,
			'push',
			'-q',
			'origin',
			`refs/heads/${name}:refs/heads/${name}`,
		);

		// The forge moves on; this clone does not notice yet.
		writeFileSync(join(root, 'newer.txt'), 'newer\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'work only the forge has');
		const newer = git(root, 'rev-parse', 'HEAD');
		git(root, 'push', '-q', '--force', 'origin', `HEAD:refs/heads/${name}`);
		git(root, 'fetch', '-q', 'origin');
		// Local branch is deliberately left at the old commit.
		expect(git(root, 'rev-parse', name)).toBe(old);

		const seen = refsUnder(root, 'delendai/wip/');
		expect(seen.get(name)).toBe(newer);
	});

	it('does not delete a ref the forge has moved since it was judged', () => {
		const { root } = repo();
		const name = 'delendai/wip/claude-opus-5/x1-S1-g1/moved';
		const judged = git(root, 'rev-parse', 'HEAD');
		git(root, 'branch', name, judged);
		git(
			root,
			'push',
			'-q',
			'origin',
			`refs/heads/${name}:refs/heads/${name}`,
		);

		writeFileSync(join(root, 'after.txt'), 'after\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'after the judgement');
		git(root, 'push', '-q', '--force', 'origin', `HEAD:refs/heads/${name}`);

		// Asked to reap the commit that WAS judged; the forge has moved.
		expect(reap(root, 'origin', name, judged)).toBe(false);
		expect(git(root, 'ls-remote', 'origin', `refs/heads/${name}`)).not.toBe(
			'',
		);
	});
});
