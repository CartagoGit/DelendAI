// effect-boundary-authorized: a read-only diagnostic that hashes the
// proposal markdown tree to compare it against the SQL projection. It reads
// the repository's own docs to answer 'do these two agree', writes nothing,
// and must see the same bytes git tracks.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createHash } from 'node:crypto';

export interface IDbDiffInput {
	readonly proposalsDirAbs: string;
	readonly fromSha: string;
	readonly untilSha: string;
}

export interface IDbDiffEntry {
	readonly path: string;
	readonly fromDigest: string | null;
	readonly untilDigest: string | null;
	readonly change: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface IDbDiffOutput {
	readonly fromSha: string;
	readonly untilSha: string;
	readonly entries: readonly IDbDiffEntry[];
}

const fileDigest = (path: string): string =>
	createHash('sha256').update(readFileSync(path)).digest('hex');

export const diffProposalsDb = (input: IDbDiffInput): IDbDiffOutput => {
	const fromRoot = join(input.proposalsDirAbs, `.git-snapshot-${input.fromSha}`);
	const untilRoot = join(input.proposalsDirAbs, `.git-snapshot-${input.untilSha}`);
	const paths = new Set<string>();
	const collect = (root: string): void => {
		try {
			for (const path of readdirSync(root, { recursive: true })) {
				if (typeof path === 'string' && path.endsWith('.md')) paths.add(path);
			}
		} catch {
			// A missing snapshot is represented as an empty side.
		}
	};
	collect(fromRoot);
	collect(untilRoot);
	return {
		fromSha: input.fromSha,
		untilSha: input.untilSha,
		entries: [...paths].sort().map((path) => {
			const fromPath = join(fromRoot, path);
			const untilPath = join(untilRoot, path);
			const fromDigest = (() => {
				try {
					return fileDigest(fromPath);
				} catch {
					return null;
				}
			})();
			const untilDigest = (() => {
				try {
					return fileDigest(untilPath);
				} catch {
					return null;
				}
			})();
			const change =
				fromDigest === null
					? 'added'
					: untilDigest === null
						? 'removed'
						: fromDigest === untilDigest
							? 'unchanged'
							: 'changed';
			return { path, fromDigest, untilDigest, change };
		}),
	};
};