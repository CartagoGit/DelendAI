/**
 * template-git-repo.helper.ts — a real git repository built once per file
 * and copied per case.
 *
 * Building a repository takes a handful of git processes; a file of twenty
 * cases that builds one each pays that twenty times. The template is built
 * once; `copy()` is a file copy plus rewriting the few files that hold an
 * absolute path (remote URLs, worktree links), which spawns nothing.
 */
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach } from 'vitest';
import type {
	IGitRepoTemplateSpec,
	IGitRepoTemplate,
} from '../contracts/interfaces/git-repo-template.interface';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const rewrite = (file: string, from: string, to: string): void => {
	if (!existsSync(file)) return;
	writeFileSync(file, readFileSync(file, 'utf8').split(from).join(to));
};

/**
 * Build the template now and clean it, and every copy, up when the file
 * ends. Call it at module or `describe` scope, where hooks can register.
 */
export const createGitRepoTemplate = (
	spec: IGitRepoTemplateSpec = {},
): IGitRepoTemplate => {
	const trunk = spec.trunk ?? 'develop';
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'git-template-')));
	const root = join(base, 'repo');
	execFileSync('git', ['init', '-q', '-b', trunk, root]);
	git(root, 'config', 'user.email', 'spec@example.test');
	git(root, 'config', 'user.name', 'Spec');
	git(root, 'config', 'commit.gpgsign', 'false');
	for (const [path, content] of Object.entries(spec.files ?? {})) {
		writeFileSync(join(root, path), content);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '--allow-empty', '-m', 'base');
	if (spec.remote === true) {
		execFileSync('git', [
			'init',
			'-q',
			'--bare',
			'-b',
			trunk,
			join(base, 'remote.git'),
		]);
		git(root, 'remote', 'add', 'origin', join(base, 'remote.git'));
		git(root, 'push', '-q', 'origin', trunk);
	}
	for (const [name, branch] of Object.entries(spec.worktrees ?? {})) {
		git(root, 'worktree', 'add', '-q', '-b', branch, join(base, name));
	}

	const copies: string[] = [];
	afterEach(() => {
		for (const dir of copies.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});
	afterAll(() => {
		rmSync(base, { recursive: true, force: true });
	});

	return {
		copy: () => {
			const target = realpathSync(
				mkdtempSync(join(tmpdir(), 'git-copy-')),
			);
			copies.push(target);
			cpSync(base, target, { recursive: true, preserveTimestamps: true });
			const copyRoot = join(target, 'repo');
			// The files that hold an absolute path name the template's.
			rewrite(join(copyRoot, '.git', 'config'), base, target);
			const admin = join(copyRoot, '.git', 'worktrees');
			if (existsSync(admin)) {
				for (const name of readdirSync(admin)) {
					rewrite(join(admin, name, 'gitdir'), base, target);
				}
			}
			const worktrees: Record<string, string> = {};
			for (const name of Object.keys(spec.worktrees ?? {})) {
				worktrees[name] = join(target, name);
				rewrite(join(target, name, '.git'), base, target);
			}
			return {
				root: copyRoot,
				worktrees,
				...(spec.remote === true
					? { remote: join(target, 'remote.git') }
					: {}),
				git: (...args) => git(copyRoot, ...args),
			};
		},
	};
};
