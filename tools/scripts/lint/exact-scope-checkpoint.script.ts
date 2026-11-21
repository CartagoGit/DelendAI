#!/usr/bin/env bun
/**
 * exact-scope-checkpoint.script.ts — makes exact scope a PROPERTY of the
 * WIP engine rather than a convention its authors currently follow.
 *
 * The whole promise of the checkpoint engine is that a commit contains
 * the claimed paths and nothing else: no other agent's dirty file, no
 * stray build output, nothing the operator happened to be editing in the
 * shared checkout. Two implementation facts carry that promise, and both
 * are one careless edit away from being lost:
 *
 *   1. The engine NEVER stages globally. `git add -A`, `git add .` and
 *      `git add :/` all absorb whatever is in the tree, which is exactly
 *      the failure mode. The engine stages named paths with
 *      `update-index` instead.
 *   2. The engine NEVER writes the repository's real index. Every
 *      command runs with `GIT_INDEX_FILE` pointed at a throwaway file,
 *      so a half-finished checkpoint cannot leave the operator's
 *      `.git/index` staged and cannot race another agent for it.
 *
 * The behavioural specs in `checkpoint.spec.ts` already assert the
 * OUTCOME ("never captures a foreign dirty file", ".git/index stays
 * byte-identical"). This guard asserts the MECHANISM, because an outcome
 * test can only fail once the mistake has been made, and because a
 * reviewer reading a diff that adds `git add -A` needs the build to say
 * why that is not a shortcut.
 *
 * Scope is deliberately narrow: the legacy `shared-direct` commit path in
 * `plugins/commit-policy` stages the workspace on purpose, and that model
 * remains supported. This checks the exact-scope engine only.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const ENGINE_REL = 'packages/core/src/lib/wip-engine';
const RUNNER_REL = `${ENGINE_REL}/git-command.ts`;

/**
 * Every spelling of "stage whatever is there". `:/` is the pathspec for
 * the repository root, so `add :/` is `add -A` under another name.
 */
const GLOBAL_STAGING = [
	/(['"`])add\1\s*,\s*(['"`])(-A|--all|-u|--update|\.|:\/)\2/u,
	/git\s+add\s+(-A|--all|\.|:\/)/u,
] as const;

/**
 * Git PORCELAIN that mutates state this engine does not own.
 *
 * The engine reaches the repository only through plumbing — `read-tree`,
 * `update-index`, `write-tree`, `commit-tree`, `update-ref`,
 * `checkout-index` — every one of which it can point at a private index.
 * The commands below cannot be scoped that way: they move the shared
 * HEAD, stage the whole worktree, or discard other agents' files.
 *
 * Banning them by name is the enforcement the behavioural specs cannot
 * provide. "Never captures a foreign dirty file" can only fail once
 * someone has already made the mistake; this fails on the diff that
 * introduces it, and says which command and why.
 *
 * Matched as WHOLE quoted tokens, so `'checkout-index'` — which is
 * plumbing and reads from the private index — is not caught by
 * `checkout`.
 */
const SHARED_STATE_PORCELAIN: Readonly<Record<string, string>> = {
	add: 'stages from the worktree into the index; the engine stages named paths with `update-index` against a private one',
	commit: 'commits the index and moves HEAD; the engine builds a commit object with `commit-tree` and moves only its own ref',
	reset: 'rewrites the shared index and can move HEAD',
	checkout:
		'moves HEAD and overwrites worktree files other agents may be editing',
	switch: 'moves the shared HEAD, which every other agent in this checkout is standing on',
	restore:
		'overwrites worktree files from an arbitrary source, with no claim check',
	stash: "removes other agents' uncommitted work from the worktree",
	clean: 'deletes untracked files, including files outside this claim',
	merge: 'writes the worktree and the shared index; the engine merges blobs off to the side with `merge-file`',
	rebase: 'rewrites history and moves HEAD',
	'cherry-pick': 'applies a commit through the shared index and HEAD',
	revert: 'applies a reverse commit through the shared index and HEAD',
	pull: 'fetches AND merges into the current branch',
	am: 'applies a mailbox through the shared index and HEAD',
	apply: 'writes the worktree outside any claim',
	mv: 'moves worktree files and stages the move in the shared index',
	rm: 'deletes worktree files and stages the deletion in the shared index',
};

/** A whole quoted token, so `checkout-index` never matches `checkout`. */
const quotedVerb = (verb: string): RegExp =>
	new RegExp(`(['"\`])${verb}\\1`, 'u');

export interface IExactScopeViolation {
	readonly file: string;
	readonly reason: string;
}

/** Every `.ts` file under `directory`, recursively, specs excluded. */
const sourceFiles = async (directory: string): Promise<readonly string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const found: string[] = [];
	for (const entry of entries) {
		const child = join(directory, entry.name);
		if (entry.isDirectory()) {
			found.push(...(await sourceFiles(child)));
		} else if (
			entry.name.endsWith('.ts') &&
			!entry.name.includes('.spec.')
		) {
			found.push(child);
		}
	}
	return found;
};

/** Pure over the sources, so the rules are testable without a repo. */
export const findExactScopeViolations = (
	sources: readonly { readonly file: string; readonly text: string }[],
): readonly IExactScopeViolation[] => {
	const violations: IExactScopeViolation[] = [];

	for (const { file, text } of sources) {
		// Comments explain why global staging is banned; they must not
		// themselves trip the rule.
		const code = text
			.split('\n')
			.filter((line) => {
				const trimmed = line.trimStart();
				return (
					!trimmed.startsWith('*') &&
					!trimmed.startsWith('//') &&
					!trimmed.startsWith('/*')
				);
			})
			.join('\n');
		for (const pattern of GLOBAL_STAGING) {
			if (pattern.test(code)) {
				violations.push({
					file,
					reason: 'stages the whole worktree; a checkpoint may only contain claimed paths — stage named paths with `update-index` instead',
				});
				break;
			}
		}
		for (const [verb, why] of Object.entries(SHARED_STATE_PORCELAIN)) {
			if (quotedVerb(verb).test(code)) {
				violations.push({
					file,
					reason: `invokes \`git ${verb}\`, which ${why}`,
				});
			}
		}
	}

	const runner = sources.find((source) =>
		source.file.endsWith('git-command.ts'),
	);
	if (runner === undefined) {
		violations.push({
			file: RUNNER_REL,
			reason: 'the engine git runner is missing; exact scope cannot be verified',
		});
	} else if (!runner.text.includes('GIT_INDEX_FILE')) {
		violations.push({
			file: runner.file,
			reason: 'no longer sets GIT_INDEX_FILE; the engine would operate on the repository index that the operator and every other agent share',
		});
	}

	return violations;
};

export const run = async (root: string): Promise<number> => {
	const directory = join(root, ENGINE_REL);
	const files = await sourceFiles(directory);
	const sources = await Promise.all(
		files.map(async (file) => ({
			file: relative(root, file),
			text: await readFile(file, 'utf8'),
		})),
	);
	const violations = findExactScopeViolations(sources);

	if (violations.length === 0) {
		console.log(
			`✓ exact-scope-checkpoint: ${sources.length} engine file(s); no global staging, and the private index is still in force.`,
		);
		return 0;
	}
	console.error(
		`✗ exact-scope-checkpoint: ${violations.length} violation(s):`,
	);
	for (const violation of violations) {
		console.error(`  - ${violation.file}: ${violation.reason}`);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await run(repoRoot()));
}
