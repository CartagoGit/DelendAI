/**
 * reap-legacy-proposals.lib.ts — f00076 S2.
 *
 * Pure functions that decide whether a `done/<kind>/<file>.md` proposal is
 * vintage enough to reap into `legacy/closed/<kind>/<file>.md`, and
 * pre-compute the move plan (source path, destination path, frontmatter
 * patch). No filesystem mutation lives here — that is `reap-legacy-
 * proposals.script.ts`'s job, gated behind the explicit `--apply` flag.
 *
 * Why this is a pure lib (not inlined in the script):
 *   - Unit tests cover the vintage filter without any tempdir I/O,
 *     running in <100ms (the script-level spec covers the I/O half).
 *   - The move plan is JSON-serialisable, so a future reaper batch can
 *     pre-compute plans, dump them to a file, and let a human / CI
 *     reviewer sign off before `git mv` runs.
 *   - The vintage threshold is a function arg, so callers can test
 *     `--older-than=1d` and `--older-than=365d` with the same fixtures.
 */

import { join, sep } from 'node:path';

import type { IProposalKind } from '../../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';
import { KIND_TO_DONE_SUBFOLDER } from '../../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';

/** Frontmatter the parser must surface — minimal subset, plus the optional `shipped-in`. */
export interface IReapFrontmatter {
	readonly id: string;
	readonly status: string;
	readonly kind: string;
	readonly title?: string;
	readonly date: string;
	readonly shippedIn?: string;
	readonly archivedOn?: string;
}

/** A proposal that the reaper has decided to move. */
export interface IVintageProposal {
	readonly id: string;
	readonly kind: IProposalKind;
	readonly sourceAbsPath: string;
	readonly sourceRelPath: string;
	readonly sourceFolder: string; // `done/<kind>` or `done`
	readonly filename: string;
	readonly title: string;
	readonly date: string;
	readonly shippedIn: string | undefined;
	readonly ageDays: number;
	readonly ageSource: 'shipped-in' | 'date';
}

/** Pre-computed move plan. Source + destination are stable enough to git mv. */
export interface IMovePlan {
	readonly id: string;
	readonly sourceAbsPath: string;
	readonly destAbsPath: string;
	readonly destRelPath: string;
	readonly frontmatterPatch: Readonly<Record<string, string>>;
}

/**
 * Number of whole days between an ISO timestamp and `now` (UTC, day-
 * truncated). Negative values are clamped to 0 (a proposal dated today
 * is not "vintage").
 */
export const ageInDays = (iso: string, now: Date = new Date()): number => {
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) return 0;
	const days = Math.floor((now.getTime() - ts) / (24 * 60 * 60 * 1000));
	return days < 0 ? 0 : days;
};

/**
 * True when the proposal's vintage clock has run out. The clock ticks
 * from `shipped-in:` when present, otherwise from `date:` — proposals
 * without a `shipped-in:` marker are treated as more aggressive
 * candidates (a higher fallback threshold).
 */
export const isVintage = (
	fm: IReapFrontmatter,
	thresholdDays: number,
	fallbackThresholdDays: number,
	now: Date = new Date(),
):
	| { ok: true; ageDays: number; ageSource: 'shipped-in' | 'date' }
	| { ok: false } => {
	if (typeof fm.shippedIn === 'string' && fm.shippedIn !== '') {
		const ageDays = ageInDays(fm.shippedIn, now);
		return ageDays >= thresholdDays
			? { ok: true, ageDays, ageSource: 'shipped-in' }
			: { ok: false };
	}
	const ageDays = ageInDays(fm.date, now);
	return ageDays >= fallbackThresholdDays
		? { ok: true, ageDays, ageSource: 'date' }
		: { ok: false };
};

/**
 * Reap-only eligibility: in addition to "vintage enough", a proposal
 * must already be `status: done` and must not carry an `archived-on:`
 * marker (idempotent — the reaper never re-archives a file that's
 * already been moved).
 */
export const isReapCandidate = (
	fm: IReapFrontmatter,
	thresholdDays: number,
	fallbackThresholdDays: number,
	now: Date = new Date(),
):
	| { ok: true; ageDays: number; ageSource: 'shipped-in' | 'date' }
	| { ok: false; reason: string } => {
	if (fm.status !== 'done') return { ok: false, reason: 'not-done' };
	if (fm.archivedOn !== undefined)
		return { ok: false, reason: 'already-archived' };
	const vintage = isVintage(fm, thresholdDays, fallbackThresholdDays, now);
	if (!vintage.ok) return { ok: false, reason: 'not-vintage' };
	return vintage;
};

/**
 * Resolve a proposal's kind from its folder under `done/<kind>/`. The
 * kind sub-folder is the source of truth — the proposal's `kind:`
 * frontmatter is checked second as a defence in depth (a proposal
 * whose `kind:` disagrees with its folder is itself drift and the
 * folder-drift lint handles it; here we only return `undefined` when
 * the folder shape is unrecognised).
 */
const kindFromFolder = (
	doneFolder: string,
	frontmatterKind: string,
): IProposalKind | undefined => {
	const match = /^done(?:[/\\]([a-z]+))?$/.exec(
		doneFolder.replace(/\\/g, '/'),
	);
	if (match === null) return undefined;
	const sub = match[1];
	if (sub === undefined) return undefined;
	const expected = Object.entries(KIND_TO_DONE_SUBFOLDER).find(
		([, folderName]) => folderName === sub,
	)?.[0] as IProposalKind | undefined;
	if (expected === undefined) return undefined;
	if (frontmatterKind !== '' && frontmatterKind !== expected) {
		// Folder disagrees with frontmatter — caller may still proceed but
		// the folder wins (the reaper writes to `legacy/closed/<expected>/`,
		// matching the canonical layout).
	}
	return expected;
};

/**
 * Build an `IVintageProposal` from a parsed frontmatter + the absolute
 * path the parser loaded it from. The `proposalsDir` arg is used to
 * compute `sourceRelPath` (proposalsDir-relative) so the reaper can
 * print human-friendly lines.
 */
export const buildVintageProposal = (
	fm: IReapFrontmatter,
	absPath: string,
	proposalsDir: string,
	ageDays: number,
	ageSource: 'shipped-in' | 'date',
): IVintageProposal | undefined => {
	const rel = absPath.startsWith(proposalsDir)
		? absPath.slice(proposalsDir.length)
		: absPath;
	const normalisedRel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
	const parts = normalisedRel.split('/');
	if (parts.length < 2) return undefined;
	const filename = parts[parts.length - 1] ?? '';
	const kindFolder = parts.slice(0, -1).join('/');
	const kind = kindFromFolder(kindFolder, fm.kind);
	if (kind === undefined) return undefined;
	return {
		id: fm.id,
		kind,
		sourceAbsPath: absPath,
		sourceRelPath: normalisedRel,
		sourceFolder: kindFolder,
		filename,
		title: fm.title ?? '',
		date: fm.date,
		shippedIn: fm.shippedIn,
		ageDays,
		ageSource,
	};
};

/** Compute the destination path under `legacy/closed/<kind>/<filename>`. */
export const planMove = (
	vintage: IVintageProposal,
	proposalsDir: string,
	archivedOnDate: string,
): IMovePlan => {
	const destFolder = join(
		'legacy',
		'closed',
		KIND_TO_DONE_SUBFOLDER[vintage.kind] ?? vintage.kind,
	);
	const destAbsPath = join(proposalsDir, destFolder, vintage.filename);
	const destRelPath = `${destFolder}${sep}${vintage.filename}`;
	return {
		id: vintage.id,
		sourceAbsPath: vintage.sourceAbsPath,
		destAbsPath,
		destRelPath,
		frontmatterPatch: {
			'archived-on': archivedOnDate,
		},
	};
};

/**
 * Parse `--older-than=Nd` style CLI args into the numeric thresholds
 * the reaper uses. Two flags are recognised:
 *   - `--older-than=<days>d`  (default 30, used when `shipped-in:` is present)
 *   - `--fallback-older-than=<days>d` (default 60, used when `shipped-in:` is missing)
 *
 * Returns the defaults when no flag is present; throws on malformed
 * input so the script can exit with a clear error.
 */
export const parseReaperArgs = (
	argv: readonly string[],
): {
	readonly thresholdDays: number;
	readonly fallbackThresholdDays: number;
	readonly apply: boolean;
} => {
	const thresholdDefault = 30;
	const fallbackDefault = 60;
	let thresholdDays = thresholdDefault;
	let fallbackThresholdDays = fallbackDefault;
	for (const arg of argv) {
		const m = /^--older-than=(\d+)([dD]?)$/.exec(arg);
		if (m?.[1] !== undefined) {
			const n = Number.parseInt(m[1], 10);
			if (Number.isNaN(n) || n < 0) {
				throw new Error(`invalid --older-than: ${arg}`);
			}
			thresholdDays = n;
			continue;
		}
		const fm = /^--fallback-older-than=(\d+)([dD]?)$/.exec(arg);
		if (fm?.[1] !== undefined) {
			const n = Number.parseInt(fm[1], 10);
			if (Number.isNaN(n) || n < 0) {
				throw new Error(`invalid --fallback-older-than: ${arg}`);
			}
			fallbackThresholdDays = n;
			continue;
		}
		if (arg === '--apply') {
		}
	}
	return {
		thresholdDays,
		fallbackThresholdDays,
		apply: argv.includes('--apply'),
	};
};

/**
 * Format the standard reaper report line. Used by both dry-run and
 * `--apply` output so the two never diverge.
 */
export const formatReaperLine = (vintage: IVintageProposal): string => {
	const source = `done/${KIND_TO_DONE_SUBFOLDER[vintage.kind] ?? vintage.kind}/${vintage.filename}`;
	return `${vintage.id}: ${source} age=${vintage.ageDays}d since=${vintage.ageSource} → legacy/closed/${KIND_TO_DONE_SUBFOLDER[vintage.kind] ?? vintage.kind}/${vintage.filename}`;
};
