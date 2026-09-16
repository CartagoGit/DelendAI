/**
 * The publication primitive, pinned at the decisions that make it safe
 * to hand to fifteen agents at once.
 *
 * Every case here is a property the shared-checkout model depends on,
 * and each one is cheap to break by accident later.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	isPublicationRef,
	modeOf,
	parseStatusPaths,
	pullRequestCommands,
	runPreflight,
	splitContent,
	stalePaths,
} from './publish-candidate.script';
import { repoRoot } from '../lib/monorepo-paths';

describe('pullRequestCommands', () => {
	const commands = pullRequestCommands({
		ref: 'delendai/pr/proposal-f00547',
		base: 'develop',
		message: 'docs(proposals): add f00547\n\nWhy it exists.',
	});

	it('looks for an open pull request on the ref before opening one', () => {
		expect(commands.find).toEqual(
			expect.arrayContaining([
				'list',
				'--head',
				'delendai/pr/proposal-f00547',
				'open',
			]),
		);
	});

	it('titles the pull request with the first line and uses the rest as its body', () => {
		expect(commands.create).toEqual([
			'pr',
			'create',
			'--base',
			'develop',
			'--head',
			'delendai/pr/proposal-f00547',
			'--title',
			'docs(proposals): add f00547',
			'--body',
			'Why it exists.',
		]);
	});

	it('arms auto-merge with a merge commit, the method the policy keeps lineage with', () => {
		expect(commands.arm).toEqual([
			'pr',
			'merge',
			'delendai/pr/proposal-f00547',
			'--auto',
			'--merge',
		]);
	});

	it('reuses the title as the body when the message is one line', () => {
		const one = pullRequestCommands({
			ref: 'delendai/pr/x',
			base: 'develop',
			message: 'fix: one line',
		});

		expect(one.create.slice(-2)).toEqual(['--body', 'fix: one line']);
	});
});

describe('isPublicationRef', () => {
	it('accepts a ref inside the publication namespace', () => {
		expect(isPublicationRef('delendai/pr/a-slice', 'delendai/pr/')).toBe(
			true,
		);
	});

	it('refuses the integration branch itself', () => {
		// The whole point of the namespace: nothing publishes onto
		// `develop`, in this model or any of the others.
		expect(isPublicationRef('develop', 'delendai/pr/')).toBe(false);
	});

	it('refuses everything when the policy has no publication namespace', () => {
		// Under direct-merge the prefix is empty, and an empty prefix
		// would otherwise match every ref in the repository.
		expect(isPublicationRef('anything', '')).toBe(false);
	});
});

describe('parseStatusPaths', () => {
	it('keeps the first modified file, which a trimmed buffer ate', () => {
		// The bug, exactly: the whole output was trimmed before
		// splitting, a modified line starts with a SPACE, and so the
		// first path lost a character and existed nowhere. The
		// publication dropped it in silence — a candidate whose point
		// was editing `.github/workflows/ci.yml` shipped without
		// `.github/workflows/ci.yml`, reporting "13 written, 0 removed".
		expect(
			parseStatusPaths(
				' M .github/workflows/ci.yml\n M lefthook.yml\n?? new.ts\n',
			),
		).toEqual(['.github/workflows/ci.yml', 'lefthook.yml', 'new.ts']);
	});

	it('reports a rename as the path it became', () => {
		// Publishing `old -> new` as a literal path would create a file
		// with an arrow in its name.
		expect(parseStatusPaths('R  old/a.ts -> new/a.ts\n')).toEqual([
			'new/a.ts',
		]);
	});

	it('unquotes a path git had to quote', () => {
		expect(parseStatusPaths(' M "docs/a b.md"\n')).toEqual(['docs/a b.md']);
	});

	it('is empty for a clean checkout', () => {
		expect(parseStatusPaths('')).toEqual([]);
	});
});

describe('splitContent', () => {
	it('carries a deletion as a deletion rather than dropping it', () => {
		// A candidate that deletes a file must say so. Publishing only
		// the paths that still exist would silently resurrect it from
		// the integration branch on the next refresh.
		const content = splitContent(
			['kept.ts', 'gone.ts'],
			(p) => p === 'kept.ts',
		);
		expect(content.written).toEqual(['kept.ts']);
		expect(content.removed).toEqual(['gone.ts']);
	});

	it('does not call a file that never existed a deletion', () => {
		// Observed: the runtime wrote a mutex file while the pre-flight
		// ran, `git status` listed it, it was gone by the time the tree
		// was built, and the publication reported "1 removed" having
		// deleted nothing. Asking the forge to delete a path the branch
		// never had is the kind of instruction that reads as sabotage.
		const content = splitContent(
			['real.ts', '.cache/x.mutex'],
			() => false,
			(p) => p === 'real.ts',
		);
		expect(content.removed).toEqual(['real.ts']);
		expect(content.vanished).toEqual(['.cache/x.mutex']);
	});
});

describe('runPreflight', () => {
	it('reports every failing check, not just the first', () => {
		const failed = runPreflight(
			(script) => (script === 'a' || script === 'c' ? 1 : 0),
			[
				{ script: 'a', because: 'x' },
				{ script: 'b', because: 'y' },
				{ script: 'c', because: 'z' },
			],
		);
		expect(failed).toEqual(['a', 'c']);
	});

	it('is empty when everything passes', () => {
		expect(runPreflight(() => 0, [{ script: 'a', because: 'x' }])).toEqual(
			[],
		);
	});
});

describe('publishing wide is opt-in', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/publish-candidate.script.ts'),
		'utf8',
	);

	it('refuses to guess which paths are this candidate', () => {
		// The checkout is shared. While this was being written the user
		// had `development-policy/validate.ts` open and edited; a
		// default-wide publish would have carried that edit into an
		// unrelated candidate under somebody else's authorship, with
		// nothing in the output saying so.
		expect(source).toContain("process.argv.includes('--all')");
		expect(source).toContain('say which paths are yours');
	});

	it('shows what it would have taken, so the wide form stays easy', () => {
		// A refusal that makes the author go and run `git status`
		// themselves is a refusal they will route around.
		expect(source).toContain('path(s) differ right now');
	});
});

describe('modeOf', () => {
	it('keeps an executable executable', () => {
		// The hardcoded `100644` it replaced silently demoted every
		// executable script to a plain file. Nothing in a diff review
		// shows it — the content is identical — and the first symptom is
		// a hook that no longer runs on somebody else's clone.
		expect(modeOf('x.sh', 'origin/develop', () => 0o100755)).toBe('100755');
	});

	it('keeps a symlink a symlink', () => {
		// Otherwise the tree gets a text file containing the link target,
		// which is exactly how a `node_modules` symlink became a blob.
		expect(modeOf('link', 'origin/develop', () => 0o120000)).toBe('120000');
	});

	it('falls back to what the integration branch says', () => {
		// A path git cannot stat is not a reason to guess `100644`.
		expect(
			modeOf(
				'gone.sh',
				'origin/develop',
				() => undefined,
				() => '100755',
			),
		).toBe('100755');
	});

	it('settles on a plain file only when nothing knows', () => {
		expect(
			modeOf(
				'x',
				'origin/develop',
				() => undefined,
				() => undefined,
			),
		).toBe('100644');
	});
});

describe('the empty-candidate refusal', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/publish-candidate.script.ts'),
		'utf8',
	);

	it('compares the built tree against the integration branch', () => {
		// #100 merged as `changed_files: 0` under a title describing a
		// twenty-two file CI redesign. The publisher must refuse to build
		// that tree at all, at the moment it happens, with the author
		// still there to see it.
		expect(source).toContain("git(['rev-parse', `${integration}^{tree}`])");
		expect(source).toContain('EMPTY_CANDIDATE');
	});
});

describe('isolation', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/publish-candidate.script.ts'),
		'utf8',
	);
	const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');

	it('proves a commit in its own worktree, never the shared checkout', () => {
		// The shared tree contains every other agent's in-flight edits and
		// the user's open buffers. Measured: the gate failed a candidate
		// over a `lint:solid` finding in a completely unrelated piece of
		// work sitting in the same tree — and it would just as happily
		// have PASSED a broken candidate that somebody else's uncommitted
		// fix was covering for. The second direction is the dangerous one,
		// because nothing about it looks like a failure.
		expect(code).toContain("'worktree', 'add', '--detach'");
		expect(code).toContain('proveCommit(commit');
	});

	it('installs the candidate’s own dependencies', () => {
		// Symlinking the shared `node_modules` would resolve every
		// `@delendai/*` import back to the shared checkout's sources,
		// which is precisely the isolation being bought.
		expect(code).toContain("'install', '--frozen-lockfile'");
	});

	it('pushes the very object it proved', () => {
		// Not a rebuild of it, and not "the checkout as it was a moment
		// ago": there must be no window in which the tree could change
		// underneath the verdict.
		const proveAt = code.indexOf('proveCommit(commit');
		const pushAt = code.indexOf("git(['push', 'origin'");
		expect(proveAt).toBeGreaterThan(-1);
		expect(pushAt).toBeGreaterThan(proveAt);
	});

	it('removes the worktree even when a check throws', () => {
		// A leaked worktree is how `.worktrees/` filled up in the first
		// place, and a thrown error is exactly when nobody is watching.
		expect(code).toMatch(/finally\s*\{[\s\S]*?'worktree',\s*'remove'/u);
		expect(code).toContain("'worktree', 'prune'");
	});
});

describe('the publication path itself', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/publish-candidate.script.ts'),
		'utf8',
	);
	const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');

	it('never moves the shared checkout', () => {
		// `checkout`, `switch` and a plain `commit` all move HEAD or the
		// working tree, and with fifteen agents sharing one clone that is
		// how a publication eats somebody else's uncommitted edit. The
		// tree is built in a throwaway index instead.
		for (const forbidden of [
			"'checkout'",
			"'switch'",
			"'commit'",
			"'stash'",
		]) {
			expect(code).not.toContain(forbidden);
		}
		expect(code).toContain('GIT_INDEX_FILE');
		expect(code).toContain("'commit-tree'");
	});

	it('never force-pushes', () => {
		// A candidate is somebody's work. Losing a push race must fail
		// loudly, not overwrite whatever arrived first.
		// The repository legitimately uses `--force` elsewhere —
		// `update-index --force-remove` for a path, `worktree remove
		// --force` for a directory. Neither is a push, so asserting on
		// the bare flag tests the wrong thing. The push call itself is
		// what must be exact.
		expect(code).not.toContain('+refs/');
		const push = /git\(\['push',[^)]*\)/u.exec(code)?.[0] ?? '';
		expect(push).not.toContain('force');
		expect(push).not.toContain('-f');
		expect(code).toContain(
			"git(['push', 'origin', `${commit}:refs/heads/${ref}`])",
		);
	});

	it('seeds the tree from the integration branch, not from the ref tip', () => {
		// This is what makes a re-publish a refresh: the candidate is
		// always "the integration branch, plus these paths", so it can
		// never carry a stale copy of a file somebody else has changed.
		expect(code).toContain("git(['read-tree', integration], env)");
	});
});

describe('stalePaths — a candidate may not revert what landed', () => {
	const blobs =
		(table: Readonly<Record<string, string>>) =>
		(path: string): string | undefined =>
			table[path];

	it('refuses a path that moved upstream while this checkout kept the old copy', () => {
		// The exact accident: a checkout five commits behind published a
		// candidate carrying an older file, which would have removed a
		// rule merged in between. Every check passed, because the tree it
		// produced was perfectly coherent — just missing somebody's work.
		expect(
			stalePaths(
				['src/validate.ts'],
				blobs({ 'src/validate.ts': 'old' }),
				blobs({ 'src/validate.ts': 'landed' }),
				blobs({ 'src/validate.ts': 'old-plus-my-edit' }),
			),
		).toEqual(['src/validate.ts']);
	});

	it('allows a path nobody moved', () => {
		expect(
			stalePaths(
				['src/a.ts'],
				blobs({ 'src/a.ts': 'same' }),
				blobs({ 'src/a.ts': 'same' }),
				blobs({ 'src/a.ts': 'mine' }),
			),
		).toEqual([]);
	});

	it('allows a path this candidate ADDS', () => {
		// Absent upstream means there is nothing it could be reverting.
		expect(
			stalePaths(
				['src/new.ts'],
				blobs({}),
				blobs({}),
				blobs({ 'src/new.ts': 'mine' }),
			),
		).toEqual([]);
	});

	it('allows a working copy that already carries what landed', () => {
		// Compared by object id, so a path edited to match exactly what
		// landed upstream is not stale — the author did the merge by
		// hand and the result is byte-identical.
		expect(
			stalePaths(
				['src/a.ts'],
				blobs({ 'src/a.ts': 'old' }),
				blobs({ 'src/a.ts': 'landed' }),
				blobs({ 'src/a.ts': 'landed' }),
			),
		).toEqual([]);
	});

	it('names every stale path, not just the first', () => {
		// An agent that has to republish should learn the whole problem
		// in one pass rather than discovering it one file at a time.
		expect(
			stalePaths(
				['a.ts', 'b.ts', 'c.ts'],
				blobs({ 'a.ts': 'o', 'b.ts': 'o', 'c.ts': 'o' }),
				blobs({ 'a.ts': 'n', 'b.ts': 'o', 'c.ts': 'n' }),
				blobs({ 'a.ts': 'm', 'b.ts': 'm', 'c.ts': 'm' }),
			),
		).toEqual(['a.ts', 'c.ts']);
	});
});
