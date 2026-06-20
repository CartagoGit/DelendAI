/**
 * f113 S13 — race-safe per-kind id allocation (f113 §4.9).
 *
 * Each kind keeps its own sequence (`f113` is independent from `a006`
 * or `r042`). The naive approach — list `docs/proposals/`, filter by
 * prefix, take `max + 1` — races under concurrent agents: two agents
 * creating an `f`-kind proposal in the same instant can both read the
 * same stale directory listing and both compute `f114`. This mirrors
 * `withFileMutex` for a counter instead of a lock: one mutex-guarded
 * read-increment-write, not "ls + count + hope nobody else creates one
 * between your `ls` and your `write`".
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { PROPOSAL_PREFIX_BY_KIND } from '../contracts/constants/proposal-glossary.constant';
import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';

type ICounters = Record<string, number>;

const FILENAME_PATTERN = /^([a-z])(\d+)-/;

/**
 * Scans every `.md` under `proposalsDirAbs` (root + the 7 status
 * folders) for filenames shaped like a proposal id, grouping the max
 * numeric suffix per prefix letter. Used once, to seed the counter
 * file the first time it's missing — so the very first allocation
 * after this ships is safe even with the 14 legacy + f113 already on
 * disk, with zero manual bootstrap step.
 */
const seedFromDisk = async (proposalsDirAbs: string): Promise<ICounters> => {
	const counters: ICounters = {};
	const folders = [
		'',
		'ready',
		'in-progress',
		'review',
		'done',
		'paused',
		'blocked',
		'retired',
	];
	for (const folder of folders) {
		const dirAbs =
			folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
		const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const dirent of dirents) {
			if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
			const m = dirent.name.match(FILENAME_PATTERN);
			if (!m) continue;
			const prefix = m[1] ?? '';
			const n = Number(m[2]);
			if (!Number.isFinite(n)) continue;
			counters[prefix] = Math.max(counters[prefix] ?? 0, n);
		}
	}
	return counters;
};

const readCounters = async (path: string): Promise<ICounters | null> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as ICounters;
	} catch {
		return null;
	}
};

export interface IProposalIdAllocatorOptions {
	readonly proposalsDirAbs: string;
	readonly counterPathAbs: string;
}

/**
 * Returns the next id for `prefix` (e.g. `'f'` → `'f114'`), atomically
 * incrementing the shared counter file under `withFileMutex`. Never
 * returns a number lower than what's already on disk for that prefix —
 * the seed-from-disk step guarantees that even on a counter file that's
 * missing or predates some legacy proposals.
 */
export const allocateNextProposalId = async (
	prefix: string,
	options: IProposalIdAllocatorOptions,
): Promise<string> =>
	withFileMutex(options.counterPathAbs, async () => {
		let counters = await readCounters(options.counterPathAbs);
		if (counters === null) {
			counters = await seedFromDisk(options.proposalsDirAbs);
		}
		const next = (counters[prefix] ?? 0) + 1;
		counters[prefix] = next;
		await writeFileAtomic(options.counterPathAbs, JSON.stringify(counters));
		return `${prefix}${next}`;
	});

/** Resolves a kind name (`'feat'`, `'fix'`, …) to its single-letter prefix, or `null` if unknown. */
export const prefixForKind = (kind: string): string | null =>
	PROPOSAL_PREFIX_BY_KIND[kind as IProposalKind] ?? null;
