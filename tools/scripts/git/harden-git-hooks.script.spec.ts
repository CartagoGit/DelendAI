import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HARDENED_MARKER, HOOK_MODE } from './harden-git-hooks.constant';
import { hardenGitHooks, hardenHookText } from './harden-git-hooks.script';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

/** A hook shaped like the one lefthook generates, including its fallback. */
const GENERATED_HOOK = [
	'#!/bin/sh',
	'',
	'call_lefthook()',
	'{',
	'  if test -n "$LEFTHOOK_BIN"',
	'  then',
	'    "$LEFTHOOK_BIN" "$@"',
	'  else',
	'    dir="$(git rev-parse --show-toplevel)"',
	'    if test -f "$dir/node_modules/lefthook/bin/index.js"',
	'    then',
	'      "$dir/node_modules/lefthook/bin/index.js" "$@"',
	'    else',
	`      echo "Can't find lefthook in PATH"`,
	'    fi',
	'  fi',
	'}',
	'',
	'call_lefthook run "pre-push" "$@"',
	'',
].join('\n');

/** A repository with a worktree, and a stand-in binary at the main root. */
const repoWithWorktree = (withBinary: boolean) => {
	const root = mkdtempSync(join(tmpdir(), 'harden-hooks-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 't@example.invalid');
	git(root, 'config', 'user.name', 'T');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'first');

	if (withBinary) {
		const bin = join(root, 'node_modules', '.bin');
		mkdirSync(bin, { recursive: true });
		const path = join(bin, 'lefthook');
		// Records that it ran, and with which arguments.
		writeFileSync(
			path,
			`#!/bin/sh\necho "ran $*" > "${join(root, 'ran.txt')}"\n`,
		);
		chmodSync(path, HOOK_MODE);
	}

	const hooks = join(root, '.git', 'hooks');
	mkdirSync(hooks, { recursive: true });
	const hook = join(hooks, 'pre-push');
	writeFileSync(hook, GENERATED_HOOK);
	chmodSync(hook, HOOK_MODE);

	const worktree = join(root, 'wt');
	git(root, 'worktree', 'add', '-q', worktree, '-b', 'work');
	return { root, hooks, hook, worktree };
};

describe('harden-git-hooks (x00566)', () => {
	it('runs the guard from a worktree, where the generated hook is blind', () => {
		const { root, hooks, hook, worktree } = repoWithWorktree(true);

		// The hook as lefthook generates it: from the worktree, the search
		// resolves the worktree, which has no node_modules.
		execFileSync(hook, [], { cwd: worktree });
		expect(existsSync(join(root, 'ran.txt'))).toBe(false);

		hardenGitHooks(hooks);
		execFileSync(hook, [], { cwd: worktree });
		expect(readFileSync(join(root, 'ran.txt'), 'utf8')).toContain(
			'run pre-push',
		);
	});

	it('refuses instead of passing when the binary cannot be resolved', () => {
		const { hooks, hook, worktree } = repoWithWorktree(false);

		// Generated: reports, and exits 0 — the push would go through.
		expect(() => execFileSync(hook, [], { cwd: worktree })).not.toThrow();

		hardenGitHooks(hooks);
		let code: number | undefined;
		try {
			execFileSync(hook, [], { cwd: worktree, stdio: 'pipe' });
		} catch (e) {
			code = (e as { status?: number }).status;
		}
		expect(code).not.toBe(0);
		expect(code).toBeDefined();
	});

	it('still runs from the shared checkout', () => {
		const { root, hooks, hook } = repoWithWorktree(true);
		hardenGitHooks(hooks);
		execFileSync(hook, [], { cwd: root });
		expect(readFileSync(join(root, 'ran.txt'), 'utf8')).toContain(
			'run pre-push',
		);
	});

	it('changes nothing on a second pass', () => {
		const { hooks, hook } = repoWithWorktree(true);
		const first = hardenGitHooks(hooks);
		expect(first.hardened).toContain('pre-push');
		const text = readFileSync(hook, 'utf8');

		const second = hardenGitHooks(hooks);
		expect(second.hardened).toEqual([]);
		expect(second.skipped).toContain('pre-push');
		expect(readFileSync(hook, 'utf8')).toBe(text);
	});

	it('leaves a hook that is not lefthook’s alone', () => {
		expect(hardenHookText('#!/bin/sh\necho mine\n')).toBeUndefined();
	});

	it('marks what it rewrote, so the rewrite is recognisable', () => {
		const hardened = hardenHookText(GENERATED_HOOK);
		expect(hardened).toBeDefined();
		expect(hardened).toContain(HARDENED_MARKER);
		expect(hardened?.split('\n')[0]).toBe('#!/bin/sh');
	});
});
