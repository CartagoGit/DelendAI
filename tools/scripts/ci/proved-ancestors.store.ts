/**
 * proved-ancestors.store.ts — the machine-level record of passed proofs.
 *
 * It lives in the git directory every worktree of the clone shares, beside
 * the compute slot (`computeSlotPath`), so a proof in one worktree is known
 * to the next. Git is read here and the choice is made in
 * `proved-ancestors.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { computeSlotPath } from '@delendai/core/runtime';

import {
	type IProofGitReader,
	type IProvedCommit,
	livingProofs,
	parseProofStore,
	type ProofScope,
	recordProof,
	serializeProofStore,
} from './proved-ancestors';

const STORE_FILE = 'proved-commits.json';

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const succeeds = (root: string, args: readonly string[]): boolean => {
	try {
		git(root, args);
		return true;
	} catch {
		return false;
	}
};

/** Where the store is kept: the slot's directory, shared by every worktree. */
export const proofStorePath = (root: string): string | undefined => {
	const slot = computeSlotPath(root);
	return slot === undefined ? undefined : join(dirname(slot), STORE_FILE);
};

/** Git as `chooseSelectionBase` asks it, read from the checkout at `root`. */
export const proofGitReader = (root: string): IProofGitReader => ({
	exists: (commit) =>
		succeeds(root, ['cat-file', '-e', `${commit}^{commit}`]),
	isAncestorOfHead: (commit) =>
		succeeds(root, ['merge-base', '--is-ancestor', commit, 'HEAD']),
	changedFileCount: (commit) =>
		git(root, ['diff', '--name-only', `${commit}...HEAD`])
			.split('\n')
			.filter((line) => line.length > 0).length,
});

/** The records still worth reading; those whose commit is gone are pruned. */
export const readProofs = (
	root: string,
	reader: IProofGitReader = proofGitReader(root),
): readonly IProvedCommit[] => {
	const path = proofStorePath(root);
	if (path === undefined) return [];
	let text = '';
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return [];
	}
	const { kept, pruned } = livingProofs(parseProofStore(text), reader);
	if (pruned > 0) writeProofs(path, kept);
	return kept;
};

const writeProofs = (path: string, proofs: readonly IProvedCommit[]): void => {
	try {
		mkdirSync(dirname(path), { recursive: true });
		const scratch = `${path}.${String(process.pid)}.tmp`;
		writeFileSync(scratch, serializeProofStore(proofs));
		renameSync(scratch, path);
	} catch {
		// A record that cannot be kept only costs the next proof its shortcut.
	}
};

/**
 * Record that the commit checked out at `root` passed a proof that began at
 * `base`. A tree with edits proved something HEAD does not hold: no record.
 */
export const recordPassedProof = (
	root: string,
	base: string,
	scope: ProofScope,
	now: Date = new Date(),
): boolean => {
	const path = proofStorePath(root);
	if (path === undefined || git(root, ['status', '--porcelain']) !== '')
		return false;
	const entry: IProvedCommit = {
		commit: git(root, ['rev-parse', 'HEAD']),
		tree: git(root, ['rev-parse', 'HEAD^{tree}']),
		base,
		scope,
		at: now.toISOString(),
	};
	writeProofs(path, recordProof(readProofs(root), entry));
	return true;
};
