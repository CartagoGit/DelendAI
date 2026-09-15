/**
 * f00016 S13 — race-safe per-kind id allocation (f00016 §4.9).
 *
 * Each kind keeps its own sequence (`f00016` is independent from `a00011`
 * or `r042`). The naive approach — list `docs/delendai/proposals/`, filter by
 * prefix, take `max + 1` — races under concurrent agents: two agents
 * creating an `f`-kind proposal in the same instant can both read the
 * same stale directory listing and both compute `f00014`. This mirrors
 * `withFileMutex` for a counter instead of a lock: one mutex-guarded
 * read-increment-write, not "ls + count + hope nobody else creates one
 * between your `ls` and your `write`".
 */
import { join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@delendai/core/public';

import {
	PROPOSAL_PREFIX_BY_KIND,
	PROPOSAL_SCAN_FOLDERS,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';
import {
	DEFAULT_ALLOCATOR_FS,
	type IAllocatorFs,
} from './proposal-id-allocator-fs';
import {
	createGitProposalIdSources,
	type IProposalIdSources,
} from './proposal-id-sources';

type ICounters = Record<string, number>;

const FILENAME_PATTERN = /^([a-z])(\d+)-/;

/**
 * Scans every `.md` under `proposalsDirAbs` (root + status folders)
 * for filenames shaped like a proposal id, grouping the max numeric
 * suffix per prefix letter. Called on **every** allocate so a present
 * but stale counter cannot reissue an on-disk id.
 *
 * DIP — `fs` is injected; default wiring uses the real filesystem.
 */
const seedFromDisk = async (
	proposalsDirAbs: string,
	fs: IAllocatorFs = DEFAULT_ALLOCATOR_FS,
): Promise<ICounters> => {
	const counters: ICounters = {};
	for (const folder of PROPOSAL_SCAN_FOLDERS) {
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
	/**
	 * Where else this clone holds proposals: sibling worktrees, remote
	 * refs, and the counter they all share. Defaults to reading them
	 * through git; a spec injects them.
	 */
	readonly sources?: IProposalIdSources;
}

/**
 * Returns the next id for `prefix` (e.g. `'f'` → `'f00014'`), atomically
 * incrementing the shared counter file under `withFileMutex`. Never
 * returns a number lower than what's already on disk for that prefix:
 * the counter file and the directory listing are **both** consulted on
 * every call and the higher of the two wins.
 *
 * Reading the counter alone is not enough. Proposals arrive on disk by
 * routes that never touch this allocator — created by hand, pulled in by
 * a merge, written by another agent — and a counter that has not seen
 * them hands out an id that already exists.
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
): Promise<string> => {
	const sources =
		options.sources ?? createGitProposalIdSources(options.proposalsDirAbs);
	// One mutex for the whole clone, not one per checkout: a counter under
	// each worktree's `.cache/` serialised agents that shared a checkout and
	// let agents in two worktrees allocate the same id at the same moment.
	const shared = await sources.sharedCounterPath();
	const lockPath = shared ?? options.counterPathAbs;
	return withFileMutex(lockPath, async () => {
		// Disk always participates, not only when the counter file is missing.
		// A present-but-stale counter (hand-written proposal, merge, other
		// agent) used to reissue an id that was already on disk — reproduced
		// as two `r00005` files, and again as `create_proposal` reissuing
		// `a00084` during a00085. Other worktrees and remote refs participate
		// for the same reason: that is where another agent's new proposal is
		// before it reaches this tree.
		const counters: ICounters = {
			...(await seedFromDisk(options.proposalsDirAbs)),
		};
		const known = [
			await readCounters(options.counterPathAbs),
			shared === null ? null : await readCounters(shared),
			await sources.elsewhere(),
		];
		for (const source of known) {
			for (const [key, value] of Object.entries(source ?? {})) {
				counters[key] = Math.max(counters[key] ?? 0, value);
			}
		}
		const next = (counters[prefix] ?? 0) + 1;
		counters[prefix] = next;
		const serialised = JSON.stringify(counters);
		// The checkout-local file stays current for `lint:proposal-id-drift`
		// and `sync:counters`, which read it.
		await writeFileAtomic(options.counterPathAbs, serialised);
		if (shared !== null) await writeFileAtomic(shared, serialised);
		return `${prefix}${String(next).padStart(5, '0')}`;
	});
};

/** Resolves a kind name (`'feat'`, `'fix'`, …) to its single-letter prefix, or `null` if unknown. */
export const prefixForKind = (kind: string): string | null =>
	PROPOSAL_PREFIX_BY_KIND[kind as IProposalKind] ?? null;
