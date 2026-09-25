/**
 * work-publish.service.spec.ts — publishing ends the work ref, and only
 * ever when the publication is proven.
 *
 * Exercised against a real repository and a real bare remote, because
 * the failure being fixed is a sequence that half happened: two pull
 * requests opened, both work refs left standing on the forge.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { holdWorkRef, resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	captureWorkingState,
	workingStateChanges,
} from '@delendai/test-kit/public';

import {
	publicationRefFor,
	publicationRefFromWorkRef,
	publishWorkRef,
	publishWorkRefExclusively,
} from './work-publish.service';

const roots: string[] = [];

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const WORK_REF = 'refs/heads/delendai/wip/claude/x00553-S5-g1-topic';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository with a bare remote and one work ref carrying a commit. */
const repoWithWork = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-publish-'));
	const remote = mkdtempSync(join(tmpdir(), 'work-publish-remote-'));
	roots.push(root, remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	// The work ref, written the way the engine writes it: HEAD untouched.
	const tree = git(root, 'rev-parse', 'HEAD^{tree}');
	const commit = git(
		root,
		'commit-tree',
		tree,
		'-p',
		git(root, 'rev-parse', 'HEAD'),
		'-m',
		'feat: the work',
	);
	git(root, 'update-ref', WORK_REF, commit);
	return root;
};

const publish = (root: string, over: Record<string, unknown> = {}) =>
	publishWorkRef({
		root,
		cwd: root,
		workRef: WORK_REF,
		publicationRef: publicationRefFor(policy, 'x00553-publishing-ends-it'),
		remote: 'origin',
		...over,
	});

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('publicationRefFromWorkRef (x00568 S1)', () => {
	it('keeps the whole name and changes only wip to pr', () => {
		expect(
			publicationRefFromWorkRef(
				policy,
				'refs/heads/delendai/wip/claude-opus-5/x00568-S1-g1/a-topic',
			),
		).toBe('refs/heads/delendai/pr/claude-opus-5/x00568-S1-g1/a-topic');
	});

	it('follows the namespace the project configured, not a hard-coded one', () => {
		const mine = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'acme', integration: 'trunk' },
			},
		});
		expect(
			publicationRefFromWorkRef(
				mine,
				'refs/heads/acme/wip/claude-opus-5/x1-S1-g1/t',
			),
		).toBe('refs/heads/acme/pr/claude-opus-5/x1-S1-g1/t');
	});

	it('has no name to keep for a ref outside the work-ref prefix', () => {
		expect(
			publicationRefFromWorkRef(policy, 'refs/heads/feature/something'),
		).toBeUndefined();
		expect(
			publicationRefFromWorkRef(policy, 'refs/heads/delendai/wip/'),
		).toBeUndefined();
	});

	it('agrees with the shape the work ref template states', () => {
		// The two templates must differ in exactly one segment. If a
		// future edit gives publication its own shape, this fails.
		const work = policy.branches.workRefTemplate
			.replace(/^heads\//u, '')
			.replace('/wip/', '/pr/');
		expect(work.startsWith(policy.branches.publicationRefPrefix)).toBe(
			true,
		);
	});
});

describe('publishWorkRef (x00553 S5)', () => {
	it('names the publication ref from the policy prefix', () => {
		expect(publicationRefFor(policy, 'a-name')).toBe(
			'refs/heads/delendai/pr/a-name',
		);
		// Already prefixed stays as it is, rather than doubling.
		expect(publicationRefFor(policy, 'delendai/pr/a-name')).toBe(
			'refs/heads/delendai/pr/a-name',
		);
	});

	it('publishes, proves it, and then the work ref is gone', () => {
		const root = repoWithWork();
		const tip = git(root, 'rev-parse', WORK_REF);
		const outcome = publish(root);
		expect(outcome.published).toBe(true);
		expect(outcome.workRefRemoved).toBe(true);
		expect(outcome.tip).toBe(tip);
		// The publication carries the work…
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/*'),
		).toContain(tip);
		// …and the work ref exists nowhere any more.
		expect(() => git(root, 'rev-parse', '--verify', WORK_REF)).toThrow();
		expect(git(root, 'ls-remote', 'origin', WORK_REF)).toBe('');
		expect(outcome.steps.map((s) => s.name)).toEqual([
			'resolve-work-ref',
			'push-publication-ref',
			'prove-publication',
			'remove-remote-work-ref',
			'remove-work-ref',
		]);
	});

	it('keeps the work ref when asked to', () => {
		const root = repoWithWork();
		const outcome = publish(root, { keepWorkRef: true });
		expect(outcome.published).toBe(true);
		expect(outcome.workRefRemoved).toBe(false);
		expect(git(root, 'rev-parse', '--verify', WORK_REF)).not.toBe('');
	});

	it('removes the worktree standing on the ref, and refuses to remove its own', () => {
		const root = repoWithWork();
		// The short branch name is what `work enter` passes, and it is
		// what attaches the worktree to the ref; a fully-qualified ref
		// produces a detached worktree that holds nothing.
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'wt'),
			WORK_REF.replace('refs/heads/', ''),
		);
		const standing = publishWorkRef({
			root,
			cwd: join(root, 'wt'),
			workRef: WORK_REF,
			publicationRef: publicationRefFor(policy, 'from-inside'),
			remote: 'origin',
		});
		expect(standing.published).toBe(true);
		expect(standing.workRefRemoved).toBe(false);
		expect(
			standing.steps.find((s) => s.name === 'remove-worktree')?.detail,
		).toContain('current directory');

		const outside = publish(root, {
			publicationRef: publicationRefFor(policy, 'from-outside'),
		});
		expect(outside.workRefRemoved).toBe(true);
	});

	it('refuses a work ref that does not exist, and removes nothing', () => {
		const root = repoWithWork();
		const outcome = publishWorkRef({
			root,
			cwd: root,
			workRef: 'refs/heads/delendai/wip/claude/nothing-here',
			publicationRef: publicationRefFor(policy, 'nothing'),
			remote: 'origin',
		});
		expect(outcome.published).toBe(false);
		expect(outcome.tip).toBeNull();
		expect(outcome.steps).toHaveLength(1);
		expect(git(root, 'rev-parse', '--verify', WORK_REF)).not.toBe('');
	});

	it('keeps the work ref when the push fails', () => {
		const root = repoWithWork();
		const outcome = publish(root, { remote: 'nowhere' });
		expect(outcome.published).toBe(false);
		expect(outcome.workRefRemoved).toBe(false);
		expect(
			outcome.steps.find((s) => s.name === 'push-publication-ref')?.ok,
		).toBe(false);
		// The only copy of the work is still here.
		expect(git(root, 'rev-parse', '--verify', WORK_REF)).not.toBe('');
	});

	it('refuses to delete a worktree that holds work made after the checkpoint', () => {
		const root = repoWithWork();
		const wt = join(root, 'wt');
		git(
			root,
			'worktree',
			'add',
			'-q',
			wt,
			WORK_REF.replace('refs/heads/', ''),
		);
		// The agent kept working after its checkpoint: one edit, one new
		// file. Proving the published commit reached the remote says
		// nothing about either of them.
		writeFileSync(join(wt, 'README.md'), '# edited after the checkpoint\n');
		writeFileSync(join(wt, 'untracked.ts'), 'export const later = 1;\n');

		const outcome = publish(root, {
			publicationRef: publicationRefFor(policy, 'with-dirty-worktree'),
		});
		expect(outcome.published).toBe(true);
		expect(outcome.workRefRemoved).toBe(false);
		expect(
			outcome.steps.find((s) => s.name === 'remove-worktree')?.detail,
		).toContain('uncommitted change(s) made after the checkpoint');
		// Both the work ref and the files are still there.
		expect(git(root, 'rev-parse', '--verify', WORK_REF)).not.toBe('');
		expect(readFileSync(join(wt, 'untracked.ts'), 'utf8')).toContain(
			'later',
		);
	});
});

describe('the uncommitted work around a publication (x00635)', () => {
	it('is left exactly as found in the checkout publishing it', () => {
		const root = repoWithWork();
		writeFileSync(join(root, 'README.md'), '# edited, not committed\n');
		writeFileSync(join(root, 'notes.txt'), 'untracked\n');
		const before = captureWorkingState(root);

		expect(publish(root).published).toBe(true);
		expect(workingStateChanges(before)).toEqual([]);
	});
});

describe('publishing holds the work ref against a cadence push', () => {
	const request = (root: string) => ({
		root,
		cwd: root,
		workRef: WORK_REF,
		publicationRef: publicationRefFor(policy, 'x00648-held'),
		remote: 'origin',
	});
	const commonDir = (root: string): string =>
		git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');

	it('publishes nothing while another process holds the ref', async () => {
		const root = repoWithWork();
		const held = await holdWorkRef({
			gitCommonDir: commonDir(root),
			ref: WORK_REF,
			pid: 4242,
		});
		expect(held.kind).toBe('acquired');

		const outcome = await publishWorkRefExclusively(request(root), {
			waitMs: 0,
		});

		expect(outcome.published).toBe(false);
		expect(outcome.steps).toEqual([
			expect.objectContaining({ name: 'hold-work-ref', ok: false }),
		]);
		expect(outcome.steps[0]?.detail).toContain('#4242');
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/*'),
		).toBe('');
		expect(git(root, 'rev-parse', '--verify', WORK_REF)).not.toBe('');
	});

	it('waits for the holder, publishes, and releases the ref', async () => {
		const root = repoWithWork();
		const held = await holdWorkRef({
			gitCommonDir: commonDir(root),
			ref: WORK_REF,
		});
		if (held.kind !== 'acquired') throw new Error('expected to hold it');
		setTimeout(() => void held.release(), 50);

		const outcome = await publishWorkRefExclusively(request(root), {
			pollMs: 10,
		});

		expect(outcome.published).toBe(true);
		expect(outcome.workRefRemoved).toBe(true);
		expect(outcome.steps[0]).toEqual(
			expect.objectContaining({ name: 'hold-work-ref', ok: true }),
		);
		const after = await holdWorkRef({
			gitCommonDir: commonDir(root),
			ref: WORK_REF,
		});
		expect(after.kind).toBe('acquired');
	});
});

describe('where a publication is pushed from', () => {
	/**
	 * A pre-push hook that records, one line per push, the directory it
	 * ran in. A publication pushes twice (the publication ref, then the
	 * deletion of the work ref); the first line is the publication.
	 */
	const recordingHook = (root: string): string => {
		const record = join(root, '.git', 'pushed-from');
		const hook = join(root, '.git', 'hooks', 'pre-push');
		writeFileSync(hook, `#!/bin/sh\npwd >> "${record}"\n`, { mode: 0o755 });
		return record;
	};
	const publishedFrom = (record: string): string =>
		readFileSync(record, 'utf8').split('\n')[0] ?? '';

	it("pushes from the unit's worktree, so a loose file in the shared checkout is not what the hook checks", () => {
		const root = repoWithWork();
		const record = recordingHook(root);
		const worktree = mkdtempSync(join(tmpdir(), 'work-publish-unit-'));
		roots.push(worktree);
		rmSync(worktree, { recursive: true, force: true });
		git(
			root,
			'worktree',
			'add',
			'-q',
			worktree,
			WORK_REF.replace('refs/heads/', ''),
		);
		writeFileSync(join(root, 'loose.md'), "somebody else's edit\n");
		// Publishing removes the unit's worktree, so its path is read first.
		const unitTree = git(worktree, 'rev-parse', '--show-toplevel');

		const outcome = publish(root, { cwd: root });

		expect(outcome.published).toBe(true);
		expect(publishedFrom(record)).toBe(unitTree);
		expect(readFileSync(join(root, 'loose.md'), 'utf8')).toContain('edit');
	});

	it('pushes from the shared checkout when the unit has no worktree', () => {
		const root = repoWithWork();
		const record = recordingHook(root);

		expect(publish(root).published).toBe(true);
		expect(publishedFrom(record)).toBe(
			git(root, 'rev-parse', '--show-toplevel'),
		);
	});
});
