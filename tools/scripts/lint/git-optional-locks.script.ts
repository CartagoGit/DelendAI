#!/usr/bin/env bun
/**
 * git-optional-locks — git reads leave the worktree they read alone.
 *
 * `git status` rewrites a stale index, and the index mtime is how this
 * project dates a worktree's activity (the reclaim flake, run 42364090265).
 * `GIT_OPTIONAL_LOCKS=0` is the switch. Two things keep it on:
 *   1. each process entry calls `applyGitOptionalLocksDefault()`, so every
 *      git it starts inherits the variable;
 *   2. no production file starts git with an `env:` object that spreads
 *      nothing in, which would drop it.
 * The shared git runners add it themselves (see git-optional-locks.helper
 * in core), and their spec checks the index mtime.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import { refuseMissingScanRoots } from './lib/scan-roots.lib';
import {
	dropsInheritedEnvironment,
	installsOptionalLocksDefault,
} from './git-optional-locks.helper';

/** The files a process starts in: each must install the default. */
const ENTRIES = [
	'packages/core/src/lib/cli/run-cli.ts',
	'tools/scripts/host/host-server.script.ts',
] as const;

const isProduction = (file: string): boolean =>
	/\.[cm]?tsx?$/u.test(file) &&
	!/\.(?:spec|test)\.[cm]?tsx?$/u.test(file) &&
	!/(?:^|\/)(?:tests?|dist|node_modules|e2e|__tests__)\//u.test(file) &&
	!file.startsWith('tools/scripts/lint/git-optional-locks.');

const main = (): number => {
	const root = repoRoot();
	if (
		refuseMissingScanRoots('git-optional-locks', root, [
			'packages',
			'plugins',
			'tools',
		])
	)
		return 1;
	const problems: string[] = [];
	for (const entry of ENTRIES) {
		if (
			!installsOptionalLocksDefault(
				readFileSync(join(root, entry), 'utf8'),
			)
		) {
			problems.push(
				`${entry}: does not call applyGitOptionalLocksDefault(); the git it starts can rewrite the indexes it reads.`,
			);
		}
	}
	const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.filter((file) => file !== '' && isProduction(file));
	for (const file of files) {
		if (dropsInheritedEnvironment(readFileSync(join(root, file), 'utf8'))) {
			problems.push(
				`${file}: starts git with an env object that spreads nothing in (drops GIT_OPTIONAL_LOCKS). Spread process.env or use gitEnvironmentFor.`,
			);
		}
	}
	for (const problem of problems) console.error(`✖ ${problem}`);
	if (problems.length === 0) {
		console.log(
			`git-optional-locks: ${String(files.length)} files checked, ${String(ENTRIES.length)} entries install the default.`,
		);
	}
	return problems.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
