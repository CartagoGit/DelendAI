/**
 * merge-resolve.ts — content-level three-way merge of the entries that
 * `read-tree -m` left unmerged, performed entirely off to the side.
 *
 * `git read-tree -m --aggressive` resolves the easy cases (only one side
 * touched the file) but leaves EVERY file both sides touched at stages
 * 1/2/3, even when the two sets of edits are nowhere near each other.
 * Reporting those as `RECOVERY_CONFLICT` would make the rebase useless in
 * practice: the common case in a shared checkout is exactly "integration
 * moved, and my slice also edits that file, in a different function".
 *
 * The porcelain answer (`git merge`, `git rebase`) is unavailable to us —
 * both need a working tree and both move HEAD. So the merge is done on
 * blobs: the three stages are materialised into a private temp directory
 * OUTSIDE the repository, `git merge-file` produces the merged text, and
 * the result is hashed straight back into the temporary index. The
 * working tree never sees any of it.
 *
 * Anything that cannot be merged as text — a missing side (add/delete), a
 * mode change, or content that is not valid UTF-8 — is reported as a
 * genuine conflict rather than guessed at.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { gitOutput, scratchRoot } from './git-command';

import type {
	IStageEntry,
	IUnmergedPath,
	IMergeResolution,
} from './merge-resolve.interface';

export type {
	IStageEntry,
	IUnmergedPath,
	IMergeResolution,
} from './merge-resolve.interface';

/** Parse `git ls-files -u`: `<mode> <sha> <stage>\t<path>`. */
export const parseUnmergedStages = (
	output: string,
): ReadonlyMap<string, IUnmergedPath> => {
	const paths = new Map<string, IUnmergedPath>();
	for (const line of output.split('\n')) {
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const path = line.slice(tab + 1).trim();
		const [mode, sha, stage] = line.slice(0, tab).trim().split(/\s+/u);
		if (
			path.length === 0 ||
			mode === undefined ||
			sha === undefined ||
			stage === undefined
		) {
			continue;
		}
		const current = paths.get(path) ?? {};
		const entry: IStageEntry = { mode, sha };
		paths.set(
			path,
			stage === '1'
				? { ...current, base: entry }
				: stage === '2'
					? { ...current, ours: entry }
					: { ...current, theirs: entry },
		);
	}
	return paths;
};

/** A NUL byte marks a binary blob; U+FFFD marks a lossy UTF-8 decode. */
const NUL = String.fromCodePoint(0);
const REPLACEMENT = String.fromCodePoint(0xfffd);

/** Text of a blob, or `undefined` when it is missing or not text. */
const blobText = async (
	run: IGitRunner,
	sha: string,
): Promise<string | undefined> => {
	const result = await run(['cat-file', 'blob', sha]);
	if (!result.ok) return undefined;
	// A NUL byte or a replacement character means the round-trip through
	// UTF-8 was lossy — merging that text would silently corrupt the blob.
	return result.output.includes(NUL) || result.output.includes(REPLACEMENT)
		? undefined
		: result.output;
};

/** Can these three sides even be attempted as a text merge? */
const isTextMergeable = (entry: IUnmergedPath): boolean =>
	entry.base !== undefined &&
	entry.ours !== undefined &&
	entry.theirs !== undefined &&
	entry.ours.mode === entry.theirs.mode &&
	entry.ours.mode === entry.base.mode &&
	entry.ours.mode.startsWith('100');

/**
 * Merge one path's three stages. Returns the merged blob id, or
 * `undefined` when the merge conflicts (or cannot be attempted).
 */
const mergeOne = async (
	run: IGitRunner,
	dir: string,
	path: string,
	entry: IUnmergedPath,
): Promise<string | undefined> => {
	if (!isTextMergeable(entry)) return undefined;
	const sides = await Promise.all([
		blobText(run, entry.ours?.sha ?? ''),
		blobText(run, entry.base?.sha ?? ''),
		blobText(run, entry.theirs?.sha ?? ''),
	]);
	if (sides.some((side) => side === undefined)) return undefined;
	const files = ['ours', 'base', 'theirs'].map((name) => join(dir, name));
	for (const [index, file] of files.entries()) {
		await writeFile(file, sides[index] ?? '', 'utf8');
	}
	// `merge-file` writes the merged result back into the first file and
	// exits non-zero when it had to leave conflict markers behind.
	const merged = await run([
		'merge-file',
		'-L',
		'new base',
		'-L',
		'merge base',
		'-L',
		'work in progress',
		...files,
	]);
	if (!merged.ok) return undefined;
	return gitOutput(run, [
		'hash-object',
		'-w',
		'--path',
		path,
		'--',
		files[0] ?? '',
	]);
};

/**
 * Merge every unmerged path in the temporary index, writing the resolved
 * content back into that index as a stage-0 entry. The working tree and
 * the real index are untouched throughout.
 */
export const resolveUnmergedPaths = async (
	run: IGitRunner,
	indexRun: IGitRunner,
): Promise<IMergeResolution> => {
	const listing = await gitOutput(indexRun, ['ls-files', '-u']);
	if (listing === undefined) {
		return {
			resolved: [],
			conflicts: [],
			reason: 'git ls-files -u failed',
		};
	}
	const unmerged = parseUnmergedStages(listing);
	if (unmerged.size === 0) return { resolved: [], conflicts: [] };

	const dir = await mkdtemp(join(await scratchRoot(run), 'merge-'));
	try {
		const resolved: string[] = [];
		const conflicts: string[] = [];
		for (const [path, entry] of [...unmerged].sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		)) {
			const sha = await mergeOne(run, dir, path, entry);
			if (sha === undefined) {
				conflicts.push(path);
				continue;
			}
			const staged = await indexRun([
				'update-index',
				'--add',
				'--cacheinfo',
				`${entry.ours?.mode ?? '100644'},${sha},${path}`,
			]);
			if (staged.ok) resolved.push(path);
			else conflicts.push(path);
		}
		return { resolved, conflicts: conflicts.sort() };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};
