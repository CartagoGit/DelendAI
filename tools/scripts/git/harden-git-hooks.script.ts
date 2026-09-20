#!/usr/bin/env bun
/**
 * harden-git-hooks.script.ts — post-`lefthook install` hardening.
 *
 * Lefthook writes each `.git/hooks/*` as a shell script that searches for
 * the lefthook binary. Two properties of that generated search are wrong
 * for this repository, and both were observed live:
 *
 *  1. **It is blind in a worktree.** The search resolves the repository
 *     with `git rev-parse --show-toplevel`, which in an agent worktree is
 *     the worktree, and a worktree has no `node_modules`. Agents are
 *     *supposed* to work in worktrees, so the guards that the work-ref
 *     doctrine rests on are missing exactly where the work happens.
 *
 *  2. **It fails open.** When no binary is found the generated script
 *     echoes `Can't find lefthook in PATH` and exits 0 — the push or the
 *     commit then succeeds with every gate skipped. A guard that passes
 *     when it cannot run is not a guard.
 *
 * There is a third, sharper edge: lefthook bakes an *absolute* path to
 * the binary it was installed from. Running `bun install` inside a
 * throwaway worktree rewrites the shared `.git/hooks/*` to point into
 * that worktree, so removing it later breaks the hooks for every other
 * worktree and for the shared checkout too.
 *
 * This script rewrites the generated hooks to resolve the binary from the
 * git **common** directory — the one path that is the same in the shared
 * checkout and in every worktree — and to exit non-zero when it finds
 * nothing. It is idempotent: a hook already carrying the preamble is left
 * alone, and running it twice changes nothing.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	HARDENED_MARKER,
	HOOK_MODE,
	LEFTHOOK_SIGNATURE,
	MANAGED_HOOKS,
	NOT_FOUND_LINE,
	preambleFor,
} from './harden-git-hooks.constant';
import type { IHardenReport } from './harden-git-hooks.interface';

/**
 * Hardens one generated hook. Returns the new text, or `undefined` when
 * the hook needs no change (not lefthook's, or already hardened).
 */
export const hardenHookText = (text: string): string | undefined => {
	if (!text.includes(LEFTHOOK_SIGNATURE)) return undefined;
	if (text.includes(HARDENED_MARKER)) return undefined;

	const lines = text.split('\n');
	const shebang = lines[0]?.startsWith('#!') ? 1 : 0;
	const withPreamble = [
		...lines.slice(0, shebang),
		...preambleFor().split('\n'),
		...lines.slice(shebang),
	].join('\n');

	// The generated fallback reports and passes. Report and refuse.
	return withPreamble.replace(
		NOT_FOUND_LINE,
		'echo "lefthook could not be resolved — refusing to run this hook unchecked" >&2\n      exit 1',
	);
};

/** Hardens every managed hook under `hooksDir`. */
export const hardenGitHooks = (hooksDir: string): IHardenReport => {
	const hardened: string[] = [];
	const skipped: string[] = [];
	for (const name of MANAGED_HOOKS) {
		const path = join(hooksDir, name);
		if (!existsSync(path)) continue;
		const next = hardenHookText(readFileSync(path, 'utf8'));
		if (next === undefined) {
			skipped.push(name);
			continue;
		}
		writeFileSync(path, next);
		chmodSync(path, HOOK_MODE);
		hardened.push(name);
	}
	return { hardened, skipped };
};

if (import.meta.main) {
	const { execFileSync } = await import('node:child_process');
	const commonDir = execFileSync(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		{ encoding: 'utf8' },
	).trim();
	const report = hardenGitHooks(join(commonDir, 'hooks'));
	if (report.hardened.length > 0) {
		console.log(
			`harden-git-hooks: hardened ${report.hardened.join(', ')}.`,
		);
	} else {
		console.log(
			'harden-git-hooks: every managed hook is already hardened.',
		);
	}
}
