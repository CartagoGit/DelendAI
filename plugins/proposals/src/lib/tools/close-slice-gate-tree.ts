/**
 * close-slice-gate-tree.ts — the identity of the tree a gate ran against.
 *
 * A recorded green result may only be reused for the exact content it was
 * measured on, so the identity is git's own tree hash of everything the
 * checkout holds that is not ignored: tracked edits and new files
 * included. It is computed in a scratch index, so the checkout's real
 * index and working tree are never touched. The gate's own run state is
 * excluded: it lives beside the code in a project that does not ignore
 * its cache, and it would otherwise change the tree it is keyed by.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GIT_TIMEOUT_MS = 60_000;
const GIT_BUFFER_BYTES = 8 * 1024 * 1024;
// A lock held while the gate runs (the proposal file's own mutex) sits
// beside the code in a project that does not ignore it, and its content
// changes with every poll.
const MUTEX_FILE_PATHSPECS = [':(glob)**/*.mutex'] as const;

const runGit = (
	cwd: string,
	args: readonly string[],
	indexFile: string,
): Promise<string | undefined> =>
	new Promise((resolve) => {
		execFile(
			'git',
			[...args],
			{
				cwd,
				encoding: 'utf8',
				timeout: GIT_TIMEOUT_MS,
				maxBuffer: GIT_BUFFER_BYTES,
				env: { ...process.env, GIT_INDEX_FILE: indexFile },
			},
			(error, stdout) =>
				resolve(error === null ? stdout.trim() : undefined),
		);
	});

/** The tree hash of the checkout's content, or `undefined` when git cannot say. */
export const fingerprintTree = async (
	cwd: string,
	excludedPaths: readonly string[] = [],
): Promise<string | undefined> => {
	const scratch = await mkdtemp(join(tmpdir(), 'close-gate-index-'));
	const indexFile = join(scratch, 'index');
	try {
		// An unborn HEAD has nothing to read; the scratch index then starts empty.
		await runGit(cwd, ['read-tree', 'HEAD'], indexFile);
		if ((await runGit(cwd, ['add', '-A'], indexFile)) === undefined) {
			return undefined;
		}
		for (const path of [...excludedPaths, ...MUTEX_FILE_PATHSPECS]) {
			const removed = await runGit(
				cwd,
				[
					'rm',
					'-r',
					'-f',
					'-q',
					'--cached',
					'--ignore-unmatch',
					'--',
					path,
				],
				indexFile,
			);
			if (removed === undefined) return undefined;
		}
		const tree = await runGit(cwd, ['write-tree'], indexFile);
		return tree === undefined || tree === '' ? undefined : tree;
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
};
