/**
 * patch-digest.ts — a stable fingerprint of "what this agent's scope
 * currently contains", which is what makes checkpointing idempotent.
 *
 * A commit sha cannot answer that question: `commit-tree` folds in the
 * timestamp, so committing the same content twice a second apart yields
 * two different shas and a WIP ref that grows without its content
 * changing. A tree sha is closer but still wrong for the purpose — it
 * describes the whole tree, including the base, so it cannot distinguish
 * "my scope is unchanged" from "someone else's commit moved the base".
 *
 * So the digest is taken over exactly the claimed scope: the sorted list
 * of claimed paths, plus the (path, mode, blob-sha) of every entry that
 * actually exists. Sorting makes it independent of the order paths were
 * claimed in; including the path list makes a DELETION visible (the path
 * stays in the list while its entry disappears), which a digest over
 * entries alone would silently read as "nothing to see".
 */

import { createHash } from 'node:crypto';

import type { IWipScopeEntry } from './types.interface';

const OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/u;

const byPath = (left: IWipScopeEntry, right: IWipScopeEntry): number =>
	left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

/**
 * Parse `git ls-files -s` (`<mode> <sha> <stage>\t<path>`) or
 * `git ls-tree -r` (`<mode> blob <sha>\t<path>`) output. One parser for
 * both because the only difference is a token this code does not use, and
 * two nearly-identical parsers is how they drift apart.
 *
 * Unmerged index entries (stage 1/2/3) are skipped: a conflicted path has
 * no single content, so it cannot contribute to a content fingerprint.
 */
export const parseObjectListing = (
	output: string,
): readonly IWipScopeEntry[] => {
	const entries: IWipScopeEntry[] = [];
	for (const line of output.split('\n')) {
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const path = line.slice(tab + 1).trim();
		if (path.length === 0) continue;
		const fields = line.slice(0, tab).trim().split(/\s+/u);
		const mode = fields[0];
		const sha = fields.find((field) => OBJECT_ID_PATTERN.test(field));
		if (mode === undefined || sha === undefined) continue;
		const stage = fields.at(-1);
		if (stage === '1' || stage === '2' || stage === '3') continue;
		entries.push({ path, mode, sha });
	}
	return entries;
};

/** Paths of a listing, sorted — the unmerged-safe view of a conflict set. */
export const parseUnmergedPaths = (output: string): readonly string[] => {
	const paths = new Set<string>();
	for (const line of output.split('\n')) {
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const path = line.slice(tab + 1).trim();
		if (path.length > 0) paths.add(path);
	}
	return [...paths].sort();
};

/**
 * Deterministic digest over a claimed scope and its current contents.
 * Identical inputs always produce an identical digest, on any machine, in
 * any process, regardless of the order the caller supplied them in.
 */
export const computePatchDigest = (
	scope: readonly string[],
	entries: readonly IWipScopeEntry[],
): string => {
	const hash = createHash('sha256');
	hash.update('delendai-wip-patch-digest\u0000v1\n');
	for (const path of [...new Set(scope)].sort()) {
		hash.update(`scope\u0000${path}\n`);
	}
	for (const entry of [...entries].sort(byPath)) {
		hash.update(
			`entry\u0000${entry.path}\u0000${entry.mode}\u0000${entry.sha}\n`,
		);
	}
	return hash.digest('hex');
};
