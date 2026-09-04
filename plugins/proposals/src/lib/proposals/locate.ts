/**
 * locate.ts
 *
 * Shared "find a proposal on disk" helper for every tool in the
 * proposals plugin. Two strategies, one interface:
 *
 *   - `locateByIndex(indexPathAbs, proposalId)` — fast O(1) lookup via
 *     `<cacheDir>/proposals/index.json` (the regenerable registry
 *     index; see x00052 for the move from
 *     `docs/delendai/proposals/index.json`). Preferred when the index is fresh
 *     (most callers run `sync_proposals` at boot).
 *   - `locateByScan(proposalsDirAbs, proposalId)` — fallback that walks
 *     the 7 status folders. Useful when the index is stale or missing
 *     (a freshly-created proposal not yet synced).
 *
 * DRY: pre-refactor, `close-plan.tool.ts#locatePlan` re-implemented the
 * scan logic; `mutate-tools.ts#locateProposalFile` re-implemented the
 * index lookup. Both now call into here, so a future change to how
 * proposals are addressed (e.g. a hash-based registry, a server-side
 * catalog) is a one-file edit.
 *
 * Pure (no I/O beyond the necessary reads). No state. Easy to unit-test.
 *
 * SOLID — Dependency Inversion. The three locators take an optional
 * `IProposalFs` port (the fourth argument for the index/scan
 * strategies, the third for the composite). Default wiring uses
 * `DEFAULT_PROPOSAL_FS` (the real fs); tests inject a fake port.
 */

import { join } from 'node:path';

import { KIND_TO_DONE_SUBFOLDER } from '../contracts/constants/proposal-glossary.constant';
import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import { DEFAULT_PROPOSAL_FS, type IProposalFs } from './locate-fs';

// ---------------------------------------------------------------------------
// Status folders a proposal may live in. Mirrors `proposal-glossary.constant.ts`.
// ---------------------------------------------------------------------------

/**
 * The 7 status folders a proposal can live in (`ready` lives at the
 * root, not under `ready/`). Kept here as a single source of truth for
 * the scan strategy — the glossary already exports these as a Map but
 * this list is order-insensitive and easier to iterate.
 */
export const PROPOSAL_STATUS_FOLDERS: readonly string[] = [
	'ready',
	'in-progress',
	'review',
	'paused',
	'blocked',
	'done',
	'retired',
];

// ---------------------------------------------------------------------------
// Result shape (the only thing callers get back).
// ---------------------------------------------------------------------------

export interface ILocatedProposal {
	/** Absolute path to the proposal markdown file. */
	readonly absPath: string;
	/** Folder the file lives in (`ready`, `in-progress`, ...). */
	readonly folder: string;
	/** Frontmatter `id`. Always matches the requested proposalId. */
	readonly id: string;
	/** Frontmatter `type` (e.g. `plan`, `feat`). Empty string if absent. */
	readonly type: string;
	/** Frontmatter `status`. Empty string if absent. */
	readonly status: string;
}

// ---------------------------------------------------------------------------
// Strategy 1 — index lookup (fast path).
// ---------------------------------------------------------------------------

interface IIndexEntry {
	readonly id?: string;
	readonly file?: string;
}

interface IIndexFile {
	readonly proposals?: readonly IIndexEntry[];
}

/**
 * Look up a proposal in `index.json` and return its file path + a few
 * frontmatter fields. Returns `null` when the index is missing,
 * unparseable, or doesn't contain the id. Callers MUST be prepared
 * to fall back to `locateByScan` — the index can lag behind the
 * filesystem by one `sync_proposals` call.
 *
 * @param proposalsDirAbs Absolute proposals content root. Required for
 *   correct path resolution since x00052 moved the index under
 *   `cacheDir` — `entry.file` is always `proposalsDir`-relative, never
 *   index-dir-relative. When omitted, falls back to `dirname(indexPathAbs)`
 *   for legacy callers that still co-locate the index with the markdown.
 */
export const locateByIndex = async (
	indexPathAbs: string,
	proposalId: string,
	fs: IProposalFs = DEFAULT_PROPOSAL_FS,
	proposalsDirAbs?: string,
): Promise<ILocatedProposal | null> => {
	const raw = await fs.read(indexPathAbs);
	if (raw === null) return null;
	let parsed: IIndexFile;
	try {
		parsed = JSON.parse(raw) as IIndexFile;
	} catch {
		return null;
	}
	const entry = (parsed.proposals ?? []).find(
		(p) => p.id === proposalId || (p.id ?? '').startsWith(`${proposalId}-`),
	);
	if (entry === undefined || typeof entry.file !== 'string') {
		return null;
	}
	// x00052: `entry.file` is proposalsDir-relative (e.g.
	// `done/feats/f00121-forge-plugin.md`). The index itself may live under
	// `.cache/delendai/proposals/index.json`, so joining against the
	// index parent would resolve to a non-existent cache path.
	const proposalsDir = proposalsDirAbs ?? join(indexPathAbs, '..');
	const absPath = entry.file.startsWith('/')
		? entry.file
		: join(proposalsDir, entry.file);
	const relFromRoot = absPath.startsWith(proposalsDir)
		? absPath.slice(proposalsDir.length + 1)
		: entry.file;
	const folder = relFromRoot.split('/')[0] ?? '';
	// We deliberately do NOT re-read the markdown here — callers that
	// need frontmatter fields beyond `id` should pair this with
	// `parseProposalDocument(absPath)`. Returning the file alone keeps
	// the fast path a single read.
	return {
		absPath,
		folder,
		id: typeof entry.id === 'string' ? entry.id : proposalId,
		type: '',
		status: '',
	};
};

// ---------------------------------------------------------------------------
// Strategy 2 — filesystem scan (fallback).
// ---------------------------------------------------------------------------

/**
 * Directories a proposal `.md` may live in under `proposalsDirAbs`.
 * Includes the 7 status folders plus `done/<kind>/` sub-folders
 * (f00042). Exported for tests.
 */
export const proposalScanDirs = (
	proposalsDirAbs: string,
): readonly string[] => {
	const dirs: string[] = PROPOSAL_STATUS_FOLDERS.map((folder) =>
		join(proposalsDirAbs, folder),
	);
	for (const sub of Object.values(KIND_TO_DONE_SUBFOLDER)) {
		if (sub !== undefined) dirs.push(join(proposalsDirAbs, 'done', sub));
	}
	return dirs;
};

/**
 * Walk the 7 status folders (+ `done/<kind>/` mirrors) and find the
 * file whose frontmatter `id` matches. Slower than `locateByIndex`
 * (one `readdir` + N reads per folder) but resilient to index drift.
 * Use this when the index is known to be stale (e.g. immediately after
 * `create_proposal` or `proposal_transition` before the next sync).
 */
export const locateByScan = async (
	proposalsDirAbs: string,
	proposalId: string,
	fs: IProposalFs = DEFAULT_PROPOSAL_FS,
): Promise<ILocatedProposal | null> => {
	for (const dir of proposalScanDirs(proposalsDirAbs)) {
		// Every status has its own subdirectory, including `ready`. The
		// `ready/` folder is NOT the proposals root — proposals live
		// inside it, sibling to `in-progress/`, `done/`, etc. Closed
		// proposals may further nest under `done/feats/`, `done/fixes/`, …
		const entries = await fs.list(dir);
		for (const name of entries) {
			if (!name.endsWith('.md')) continue;
			const path = join(dir, name);
			const raw = await fs.read(path);
			if (raw === null) continue;
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			// Match by frontmatter `id`, NOT by filename prefix. The
			// filename is a convention (e.g. `q00001-plan-of-plans.md`)
			// but the authoritative identity is the frontmatter `id` —
			// `q00001` and `q00001-plan-of-plans` are the same id for
			// the same proposal. Filename prefix filtering would reject
			// legitimate proposals whose filename doesn't follow the
			// `<id>-<slug>.md` convention (some test fixtures and
			// hand-edited files do not).
			if (fm.id === proposalId) {
				const rel = path.startsWith(proposalsDirAbs)
					? path.slice(proposalsDirAbs.length + 1)
					: name;
				const folder = rel.split('/')[0] ?? '';
				return {
					absPath: path,
					folder,
					id: proposalId,
					type: typeof fm.type === 'string' ? fm.type : '',
					status: typeof fm.status === 'string' ? fm.status : '',
				};
			}
		}
	}
	return null;
};

// ---------------------------------------------------------------------------
// Composite — try index first, fall back to scan.
// ---------------------------------------------------------------------------

export interface ILocateOptions {
	readonly indexPathAbs: string;
	readonly proposalsDirAbs: string;
}

/**
 * Locate a proposal, preferring the index (cheap) but falling back to
 * a filesystem scan (resilient). Returns `null` only when neither
 * strategy finds the id.
 */
export const locateProposal = async (
	proposalId: string,
	options: ILocateOptions,
	fs: IProposalFs = DEFAULT_PROPOSAL_FS,
): Promise<ILocatedProposal | null> => {
	const fromIndex = await locateByIndex(
		options.indexPathAbs,
		proposalId,
		fs,
		options.proposalsDirAbs,
	);
	if (fromIndex !== null) {
		// Index hit — but we still need `type` + `status` for tools that
		// branch on them (e.g. close-plan rejecting non-`plan` types).
		// A second fast read here is cheaper than a scan.
		const raw = await fs.read(fromIndex.absPath);
		if (raw !== null) {
			const block = extractYamlBlock(raw);
			if (block !== null) {
				const fm = parseFrontmatterBlock(block);
				return {
					...fromIndex,
					type: typeof fm.type === 'string' ? fm.type : '',
					status: typeof fm.status === 'string' ? fm.status : '',
				};
			}
		}
		// The index entry is stale (the file moved or became unreadable).
		// Fall back to the filesystem scan so callers that need current
		// frontmatter status do not receive an empty status from old index
		// metadata.
	}
	return locateByScan(options.proposalsDirAbs, proposalId, fs);
};
