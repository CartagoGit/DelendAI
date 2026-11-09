/**
 * git-read.helper.spec.ts — the one synchronous git read answers about
 * the repository it was asked about, inside a hook too.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IGitSpawn } from '@delendai/core/lib/contracts/interfaces/git-read.interface';
import { runGitCommand } from '@delendai/core/lib/shared/git-command.helper';
import {
	gitVerbatim,
	observeGitSpawns,
	readGit,
	withGitReadCache,
} from '@delendai/core/lib/shared/git-read.helper';
import { createGitRunner } from '@delendai/core/lib/shared/git-write';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
	delete process.env.GIT_DIR;
});

const repo = (file: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'git-read-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
	writeFileSync(join(root, file), 'x\n');
	return root;
};

describe('readGit', () => {
	it('answers trimmed, or untouched when asked, and undefined on failure', () => {
		const root = repo('a.txt');
		expect(readGit(root, ['rev-parse', '--is-inside-work-tree'])).toBe(
			'true',
		);
		expect(gitVerbatim(root, ['status', '--porcelain'])).toBe('?? a.txt\n');
		expect(readGit(root, ['no-such-command'])).toBeUndefined();
	});

	it('writes its input to git', () => {
		const root = repo('a.txt');
		expect(
			readGit(root, ['hash-object', '--stdin'], { input: 'x\n' }),
		).toBe(readGit(root, ['hash-object', 'a.txt']));
	});

	it('answers about the repository asked, not the one a hook names', () => {
		const hook = repo('hook-only.txt');
		const asked = repo('asked-only.txt');
		process.env.GIT_DIR = join(hook, '.git');
		expect(gitVerbatim(asked, ['status', '--porcelain'])).toBe(
			'?? asked-only.txt\n',
		);
	});
});

describe('the spawn seam', () => {
	it('tells an observer of every git process, and nothing once it stops', async () => {
		const root = repo('a.txt');
		const seen: string[] = [];
		const stop = observeGitSpawns(({ args }) => seen.push(args[0] ?? ''));
		readGit(root, ['rev-parse', '--git-dir']);
		runGitCommand(root, ['status', '--porcelain']);
		await createGitRunner(root)(['log', '-1']);
		stop();
		readGit(root, ['rev-parse', '--git-dir']);
		expect(seen).toEqual(['rev-parse', 'status', 'log']);
	});

	it('lets a cache answer a read, and reports every command to it', () => {
		const root = repo('a.txt');
		const remembered = new Map<string, string | undefined>();
		const ran: string[] = [];
		const key = ({ cwd, args }: IGitSpawn): string =>
			`${cwd}\0${args.join('\0')}`;
		const cache = {
			recall: (spawn: IGitSpawn) =>
				remembered.has(key(spawn))
					? { output: remembered.get(key(spawn)) }
					: undefined,
			remember: (spawn: IGitSpawn, output: string | undefined) => {
				remembered.set(key(spawn), output);
			},
			ran: (spawn: IGitSpawn) => {
				ran.push(spawn.args.join(' '));
			},
			forgetUnit: () => undefined,
		};
		const [first, again, verbatim] = withGitReadCache(cache, () => {
			const answers = [
				readGit(root, ['rev-parse', '--git-dir']),
				readGit(root, ['rev-parse', '--git-dir']),
				gitVerbatim(root, ['rev-parse', '--git-dir']),
			];
			readGit(root, ['hash-object', '--stdin'], { input: 'x\n' });
			runGitCommand(root, ['update-ref', 'refs/heads/x', 'HEAD']);
			return answers;
		});
		readGit(root, ['rev-parse', '--git-dir']);
		expect(first).toBe('.git');
		expect(again).toBe('.git');
		expect(verbatim).toBe('.git\n');
		expect(ran).toEqual([
			'rev-parse --git-dir',
			'hash-object --stdin',
			'update-ref refs/heads/x HEAD',
		]);
	});
});
