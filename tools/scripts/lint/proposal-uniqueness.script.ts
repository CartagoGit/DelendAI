#!/usr/bin/env bun
/**
 * proposal-uniqueness.script.ts — x00529 S2.
 *
 * A proposal id must name exactly one file. The folder IS the status,
 * so the same id living in `ready/feats/` and `done/feats/` at once is
 * two competing truths for one entity — and the 2026-09-08 audit found
 * eleven of them (f00284, f00500, f00502, f00522, x00306, x00323 in
 * THREE folders, x00510, x00514, x00515, x00524, r00047). In every pair
 * the copy in the more advanced folder carried `shipped-in`,
 * `closed-at`, `last-transition-*` and `review-state: done` while the
 * other was a pre-transition snapshot: a transition had copied instead
 * of moved, or written the destination without removing the source.
 *
 * The cost was out of all proportion to the cause. `sync_proposals`
 * refuses to clobber a rename target, so ONE stale file threw before
 * the index was regenerated — freezing proposal indexing for the whole
 * repository until a human found it by hand. x00529 S1 stops the
 * transition from creating the pair and S3 stops one pair from
 * blocking the sweep; this is the guardrail that says the invariant out
 * loud and fails CI the moment it is broken again.
 *
 * `legacy/` is excluded deliberately: it is a historical archive of
 * already-closed proposals (178 of them today), not a status folder,
 * and a reaped proposal legitimately keeps `status: done` there.
 *
 * File I/O is injected so the spec builds duplicates in a temp fixture
 * and never in the real proposals tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Workspace-relative root of the proposals tree. */
export const PROPOSALS_DIR_REL = 'docs/delendai/proposals';

/**
 * Top-level subtrees that are NOT status folders and therefore do not
 * participate in the uniqueness invariant. `legacy/` is the historical
 * archive; its contents are closed proposals kept out of the active
 * tree on purpose.
 */
export const EXCLUDED_TOP_LEVEL_FOLDERS = ['legacy'] as const;

/**
 * Forward lifecycle order used to name the copy to believe. Mirrors
 * `LIFECYCLE_ADVANCEMENT_ORDER` in the proposals plugin; parked states
 * (`paused`, `blocked`, `retired`) are deliberately absent — they are
 * not points on the forward path, so a parked copy is never declared
 * "more advanced" than a forward one.
 */
export const LIFECYCLE_ADVANCEMENT_ORDER = [
	'ready',
	'in-progress',
	'review',
	'done',
] as const;

/** A proposal id: one kind letter plus five digits (e.g. `f00284`). */
const PROPOSAL_ID_PATTERN = /^[a-z]\d{5}$/;

/** One markdown file handed to the pure core. */
export interface IProposalSource {
	/** Path relative to the proposals dir, POSIX-separated. */
	readonly relPath: string;
	readonly text: string;
}

/** A parsed proposal file that participates in the invariant. */
export interface IProposalRecord {
	readonly relPath: string;
	readonly id: string;
	/** Frontmatter `status`, or `undefined` when absent/unreadable. */
	readonly status: string | undefined;
	/** First path segment — the status folder, or `(root)`. */
	readonly folder: string;
}

/** One id found in more than one place. */
export interface IDuplicateProposalGroup {
	readonly id: string;
	readonly copies: readonly IProposalRecord[];
	/**
	 * The copy furthest along the forward lifecycle, or `null` when the
	 * copies are not comparable (a tie, or a parked/unknown status) —
	 * in which case a human has to choose.
	 */
	readonly mostAdvanced: IProposalRecord | null;
}

export interface IProposalUniquenessResult {
	readonly scanned: number;
	readonly duplicates: readonly IDuplicateProposalGroup[];
	readonly ok: boolean;
}

/**
 * Rank on the forward lifecycle, or `null` for parked/unknown. `null`
 * means "not comparable", never "rank zero".
 */
export const lifecycleRank = (status: string | undefined): number | null => {
	if (typeof status !== 'string') return null;
	const index = (LIFECYCLE_ADVANCEMENT_ORDER as readonly string[]).indexOf(
		status.trim(),
	);
	return index === -1 ? null : index;
};

/**
 * Reads one scalar out of the LEADING frontmatter block only. An `id:`
 * inside a fenced code block in the body is prose about a proposal, not
 * a claim to be that proposal, and must never be counted.
 */
export const readFrontmatterField = (
	text: string,
	field: string,
): string | undefined => {
	if (!text.startsWith('---')) return undefined;
	const end = text.indexOf('\n---', 3);
	if (end === -1) return undefined;
	const block = text.slice(text.indexOf('\n') + 1, end);
	for (const line of block.split('\n')) {
		const match = new RegExp(`^${field}:\\s*(.*)$`).exec(line);
		if (match === null) continue;
		const value = (match[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
		return value.length > 0 ? value : undefined;
	}
	return undefined;
};

/** The status folder a relative path sits in. */
export const folderOf = (relPath: string): string => {
	const first = relPath.split('/')[0] ?? '';
	return first === '' || !relPath.includes('/') ? '(root)' : first;
};

/** True when the path lives under an excluded (non-status) subtree. */
export const isExcludedPath = (relPath: string): boolean =>
	(EXCLUDED_TOP_LEVEL_FOLDERS as readonly string[]).includes(
		folderOf(relPath),
	);

/**
 * Turns raw sources into the records that participate in the
 * invariant. Anything without a well-formed proposal `id` in its
 * frontmatter (READMEs, session notes, audit write-ups, index files) is
 * ignored — only proposals carry the invariant.
 */
export const collectProposalRecords = (
	sources: readonly IProposalSource[],
): readonly IProposalRecord[] => {
	const records: IProposalRecord[] = [];
	for (const source of sources) {
		if (isExcludedPath(source.relPath)) continue;
		const id = readFrontmatterField(source.text, 'id');
		if (id === undefined || !PROPOSAL_ID_PATTERN.test(id)) continue;
		records.push({
			relPath: source.relPath,
			id,
			status: readFrontmatterField(source.text, 'status'),
			folder: folderOf(source.relPath),
		});
	}
	return records;
};

/**
 * The single copy strictly furthest along the forward lifecycle, or
 * `null` when nothing is strictly ahead (a tie, or any copy parked /
 * unranked). Refusing to name a winner is the honest answer — the fix
 * then belongs to a human, not to a heuristic.
 */
const pickMostAdvanced = (
	copies: readonly IProposalRecord[],
): IProposalRecord | null => {
	let best: IProposalRecord | null = null;
	let bestRank = -1;
	let tied = false;
	for (const copy of copies) {
		const rank = lifecycleRank(copy.status);
		if (rank === null) return null;
		if (rank > bestRank) {
			best = copy;
			bestRank = rank;
			tied = false;
		} else if (rank === bestRank) {
			tied = true;
		}
	}
	return tied ? null : best;
};

/**
 * The pure core: any id backed by more than one file is a duplicate.
 *
 * Two files in the SAME folder are flagged too — one id, two files is
 * the failure whether or not the folders differ, and the rename-target
 * collision that froze `sync_proposals` does not care either.
 */
export const findDuplicateProposals = (
	records: readonly IProposalRecord[],
): IProposalUniquenessResult => {
	const byId = new Map<string, IProposalRecord[]>();
	for (const record of records) {
		const bucket = byId.get(record.id);
		if (bucket === undefined) byId.set(record.id, [record]);
		else bucket.push(record);
	}
	const duplicates: IDuplicateProposalGroup[] = [];
	for (const [id, bucket] of [...byId.entries()].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		if (bucket.length < 2) continue;
		const copies = [...bucket].sort((a, b) =>
			a.relPath.localeCompare(b.relPath),
		);
		duplicates.push({ id, copies, mostAdvanced: pickMostAdvanced(copies) });
	}
	return {
		scanned: records.length,
		duplicates,
		ok: duplicates.length === 0,
	};
};

const describeCopy = (record: IProposalRecord): string =>
	`${record.relPath} (folder ${record.folder}, status ${record.status ?? 'unknown'})`;

export const formatReport = (result: IProposalUniquenessResult): string => {
	if (result.ok) {
		return `✓ proposal-uniqueness: ${result.scanned} proposals, every id in exactly one place (legacy/ excluded).`;
	}
	const lines = [
		`✖ proposal-uniqueness: ${result.duplicates.length} id(s) exist in more than one place (of ${result.scanned} proposals scanned):`,
	];
	for (const group of result.duplicates) {
		lines.push(`  ${group.id}:`);
		for (const copy of group.copies) lines.push(`    ${describeCopy(copy)}`);
		lines.push(
			group.mostAdvanced === null
				? '    most advanced: UNDECIDABLE (tie, or a parked/unknown status) — choose by hand.'
				: `    most advanced: ${group.mostAdvanced.relPath} (status ${group.mostAdvanced.status ?? 'unknown'})`,
		);
	}
	lines.push(
		'  The folder is the status, so one id in two folders is two competing truths,',
		'  and a single pair makes sync_proposals refuse its rename and skip the index.',
		'  fix: keep the copy listed as most advanced, delete the other, then run sync_proposals.',
	);
	return lines.join('\n');
};

/** Loads every markdown file under a proposals dir. Injectable for tests. */
export type ILoadProposalSources = (
	proposalsDirAbs: string,
) => readonly IProposalSource[];

/** Default loader: a recursive walk over the real filesystem. */
export const loadProposalSources: ILoadProposalSources = (proposalsDirAbs) => {
	const sources: IProposalSource[] = [];
	let entries: readonly string[];
	try {
		entries = readdirSync(proposalsDirAbs, { recursive: true }).map(
			(entry) => String(entry),
		);
	} catch {
		return [];
	}
	for (const entry of entries) {
		if (!entry.endsWith('.md')) continue;
		const relPath = entry.split(sep).join('/');
		if (isExcludedPath(relPath)) continue;
		try {
			sources.push({
				relPath,
				text: readFileSync(join(proposalsDirAbs, entry), 'utf8'),
			});
		} catch {
			// Unreadable file: nothing to assert about its id.
		}
	}
	return sources;
};

/** Scans a proposals dir end to end. */
export const checkProposalUniqueness = (
	proposalsDirAbs: string,
	load: ILoadProposalSources = loadProposalSources,
): IProposalUniquenessResult =>
	findDuplicateProposals(collectProposalRecords(load(proposalsDirAbs)));

/** CLI shell. Returns the process exit code. */
export const main = (
	cwd: string = repoRoot(),
	load: ILoadProposalSources = loadProposalSources,
): number => {
	const result = checkProposalUniqueness(join(cwd, PROPOSALS_DIR_REL), load);
	process.stdout.write(`${formatReport(result)}\n`);
	return result.ok ? 0 : 1;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) process.exit(main());
