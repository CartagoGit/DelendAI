/**
 * refresh-candidate-artifacts.script.spec.ts — a candidate comes up to
 * the integration branch with its derived files recomputed, and never at
 * the cost of the shared checkout.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	GENERATED_REFRESH_COMMANDS,
	refreshCandidate,
	staleCandidates,
} from './refresh-candidate-artifacts.script';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A clone with a bare remote and one candidate behind `develop`. */
const repoWithCandidate = (): { readonly root: string } => {
	const base = mkdtempSync(join(tmpdir(), 'candidate-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'work');
	execFileSync('mkdir', ['-p', remote, root]);
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'c@example.com');
	git(root, 'config', 'user.name', 'C');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'derived.json'), '{"count":1}\n');
	writeFileSync(join(root, 'authored.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');

	// The candidate branches here…
	git(root, 'branch', 'delendai/pr/candidate');
	git(root, 'push', '-q', 'origin', 'delendai/pr/candidate');
	// …and develop moves on without it.
	writeFileSync(join(root, 'authored.ts'), 'export const a = 2;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'develop moves');
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return { root };
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('staleCandidates (x00565)', () => {
	it('names the candidates the integration branch has moved past', () => {
		const { root } = repoWithCandidate();
		expect(staleCandidates(root, policy, 'origin')).toEqual([
			'delendai/pr/candidate',
		]);
	});

	it('names none once they are level', () => {
		const { root } = repoWithCandidate();
		git(root, 'push', '-q', 'origin', 'develop:delendai/pr/candidate');
		git(root, 'fetch', '-q', 'origin', '--prune');
		expect(staleCandidates(root, policy, 'origin')).toEqual([]);
	});
});

describe('refreshCandidate (x00565)', () => {
	it('merges, regenerates and pushes, without moving the shared checkout', () => {
		const { root } = repoWithCandidate();
		const before = git(root, 'rev-parse', 'HEAD');
		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			// Stands in for `catalog:generate` — it rewrites the derived
			// file the way a generator would.
			run: (_command, cwd) => {
				writeFileSync(join(cwd, 'derived.json'), '{"count":2}\n');
				return true;
			},
		});
		expect(outcome).toMatchObject({ state: 'refreshed' });
		// The shared checkout is exactly where it was.
		expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');

		git(root, 'fetch', '-q', 'origin');
		const pushed = git(
			root,
			'show',
			'origin/delendai/pr/candidate:derived.json',
		);
		expect(pushed).toContain('"count":2');
		// And it carries what develop had moved on with.
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:authored.ts'),
		).toContain('a = 2');
	});

	it('leaves a candidate that does not merge trivially to its author', () => {
		const { root } = repoWithCandidate();
		// The candidate edits the same line develop moved.
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'wt'),
			'delendai/pr/candidate',
		);
		writeFileSync(join(root, 'wt', 'authored.ts'), 'export const a = 3;\n');
		git(join(root, 'wt'), 'add', '-A');
		git(join(root, 'wt'), 'commit', '-q', '-m', 'candidate edits it too');
		git(join(root, 'wt'), 'push', '-q', 'origin', 'delendai/pr/candidate');
		git(root, 'worktree', 'remove', '--force', join(root, 'wt'));
		git(root, 'fetch', '-q', 'origin');

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => true,
		});
		expect(outcome.state).toBe('conflicted');
		expect(outcome.detail).toContain('author decides');
		// Untouched on the remote.
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:authored.ts'),
		).toContain('a = 3');
	});

	it('reports a generator that failed and pushes nothing', () => {
		const { root } = repoWithCandidate();
		const before = git(root, 'rev-parse', 'origin/delendai/pr/candidate');
		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => false,
		});
		expect(outcome.state).toBe('failed');
		expect(outcome.detail).toContain('generators failed');
		git(root, 'fetch', '-q', 'origin');
		expect(git(root, 'rev-parse', 'origin/delendai/pr/candidate')).toBe(
			before,
		);
	});

	it('leaves no worktree behind, whatever happened', () => {
		const { root } = repoWithCandidate();
		refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => false,
		});
		expect(
			git(root, 'worktree', 'list').split('\n').filter(Boolean),
		).toHaveLength(1);
	});

	it('does not read the derived file from the merge, but from the generator', () => {
		const { root } = repoWithCandidate();
		refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: (_command, cwd) => {
				// Whatever the merge produced, the generator's answer wins.
				writeFileSync(join(cwd, 'derived.json'), '{"count":99}\n');
				return true;
			},
		});
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:derived.json'),
		).toContain('"count":99');
		expect(readFileSync(join(root, 'derived.json'), 'utf8')).toContain(
			'"count":1',
		);
	});
});

describe('what a refreshed candidate regenerates', () => {
	it('installs from the merged lockfile, then runs gen:all, the one list of generators', () => {
		expect(GENERATED_REFRESH_COMMANDS).toEqual([
			'install --frozen-lockfile',
			'run gen:all',
		]);
	});
});
