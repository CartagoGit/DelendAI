/**
 * f00016 S13 — race-safe per-kind id allocation (f00016 §4.9).
 *
 * Each kind keeps its own sequence (`f00016` is independent from `a00011`
 * or `r042`). The naive approach — list `docs/mcp-vertex/proposals/`, filter by
 * prefix, take `max + 1` — races under concurrent agents: two agents
 * creating an `f`-kind proposal in the same instant can both read the
 * same stale directory listing and both compute `f00014`. This mirrors
 * `withFileMutex` for a counter instead of a lock: one mutex-guarded
 * read-increment-write, not "ls + count + hope nobody else creates one
 * between your `ls` and your `write`".
 */
import { join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { PROPOSAL_PREFIX_BY_KIND } from '../contracts/constants/proposal-glossary.constant';
import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';
import {
	DEFAULT_ALLOCATOR_FS,
	type IAllocatorFs,
} from './proposal-id-allocator-fs';

type ICounters = Record<string, number>;

const FILENAME_PATTERN = /^([a-z])(\d+)-/;

/**
 * Scans every `.md` under `proposalsDirAbs` (root + the 7 status
 * folders) for filenames shaped like a proposal id, grouping the max
 * numeric suffix per prefix letter. Used once, to seed the counter
 * file the first time it's missing — so the very first allocation
 * after this ships is safe even with the 14 legacy + f00016 already on
 * disk, with zero manual bootstrap step.
 *
 * DIP — `fs` is injected; default wiring uses the real filesystem.
 */
const seedFromDisk = async (
	proposalsDirAbs: string,
	fs: IAllocatorFs = DEFAULT_ALLOCATOR_FS,
): Promise<ICounters> => {
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
		const entries = await fs.list(dirAbs);
		for (const entry of entries) {
			if (!entry.isFile || !entry.name.endsWith('.md')) continue;
			const m = entry.name.match(FILENAME_PATTERN);
			if (!m) continue;
			const prefix = m[1] ?? '';
			const n = Number(m[2]);
			if (!Number.isFinite(n)) continue;
			counters[prefix] = Math.max(counters[prefix] ?? 0, n);
		}
	}
	return counters;
};

const readCounters = async (
	path: string,
	fs: IAllocatorFs = DEFAULT_ALLOCATOR_FS,
): Promise<ICounters | null> => {
	const raw = await fs.read(path);
	if (raw === null) return null;
	try {
		return JSON.parse(raw) as ICounters;
	} catch {
		return null;
	}
};

export interface IProposalIdAllocatorOptions {
	readonly proposalsDirAbs: string;
	readonly counterPathAbs: string;
}

/**
 * Returns the next id for `prefix` (e.g. `'f'` → `'f00014'`), atomically
 * incrementing the shared counter file under `withFileMutex`. Never
 * returns a number lower than what's already on disk for that prefix —
 * the seed-from-disk step guarantees that even on a counter file that's
 * missing or predates some legacy proposals.
 *
 * IDs are formatted as padded 5-digit numbers (f00001, f00014, …) to
 * align with the f00023 "renumber with padding" rule, which the linter
 * enforces for new proposals going forward. Legacy 3-digit ids remain
 * accepted on read (the linter regex is `^[a-z]\d{3,}$`) but the
 * allocator never produces them — it always emits the canonical
 * padded form so the on-disk set is monotonically migrating to
 * f00023-compliant names.
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
		return `${prefix}${String(next).padStart(5, '0')}`;
	});

/** Resolves a kind name (`'feat'`, `'fix'`, …) to its single-letter prefix, or `null` if unknown. */
export const prefixForKind = (kind: string): string | null =>
	PROPOSAL_PREFIX_BY_KIND[kind as IProposalKind] ?? null;
