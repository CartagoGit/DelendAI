import { mkdir, open } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader, withFileMutex } from '@mcp-vertex/core/public';

/**
 * x00154 S6 — typed error thrown by `readPeerReviewLog` when the
 * file exists but is empty or cannot be read for any reason other
 * than `ENOENT` (missing file). The previous `.catch(() => '')`
 * collapsed three different states — missing, empty, and corrupt —
 * into one silent empty-history outcome, which made it impossible
 * for callers to tell "no peer review yet" from "the log is broken
 * and we should refuse to make a decision".
 *
 * Callers should map this to `{ ok: false, error: 'no-log-readable' }`
 * at the tool envelope layer.
 */
export class PeerReviewLogUnreadableError extends Error {
	override readonly cause: unknown;
	constructor(cause: unknown) {
		super(`peer-review log is not readable: ${describeError(cause)}`);
		this.name = 'PeerReviewLogUnreadableError';
		this.cause = cause;
	}
}

const describeError = (value: unknown): string => {
	if (value === null || value === undefined) return String(value);
	if (typeof value === 'string') return value;
	if (
		typeof value === 'object' &&
		'message' in (value as Record<string, unknown>)
	) {
		const message = (value as { message?: unknown }).message;
		if (typeof message === 'string') return message;
	}
	return String(value);
};

const isMissingFileErrno = (err: unknown): boolean => {
	// x00154 S6 — only ENOENT is the legitimate "no log yet" state.
	// ENOTDIR (parent path is a file) and EACCES/EIO/… are real
	// read failures that the caller must surface, not paper over.
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT';
};

export interface IPeerReviewTransitionLogEntry {
	readonly kind: 'transition';
	readonly ts: string;
	readonly proposalId: string;
	readonly from: string;
	readonly to: 'review';
}

export interface IPeerReviewActionLogEntry {
	readonly kind: 'review';
	readonly ts: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly action: 'submit' | 'approve' | 'request_changes';
	readonly implementer: string | null;
	readonly reviewer: string | null;
	readonly verdict?: 'approved' | 'requested_changes';
}

export type IPeerReviewLogEntry =
	| IPeerReviewTransitionLogEntry
	| IPeerReviewActionLogEntry;

const parseEntry = (line: string): IPeerReviewLogEntry | null => {
	if (line.trim() === '') return null;
	try {
		return JSON.parse(line) as IPeerReviewLogEntry;
	} catch {
		return null;
	}
};

/**
 * Durable JSONL append for peer-review history (a00085 #3).
 * Serializes writers with `withFileMutex` and fsyncs the handle so a
 * crash after `writeFile` cannot drop the just-recorded verdict.
 * Accepts any JSON-serialisable record so both the typed helper and
 * the authoring-tool snake_case journal share one writer.
 */
export const appendPeerReviewJsonl = async (
	logPathAbs: string,
	entry: unknown,
): Promise<void> => {
	await mkdir(dirname(logPathAbs), { recursive: true });
	await withFileMutex(logPathAbs, async () => {
		const handle = await open(logPathAbs, 'a');
		try {
			await handle.writeFile(`${JSON.stringify(entry)}\n`, 'utf8');
			await handle.sync();
		} finally {
			await handle.close();
		}
	});
};

export const appendPeerReviewLogEntry = async (
	logPathAbs: string,
	entry: IPeerReviewLogEntry,
): Promise<void> => appendPeerReviewJsonl(logPathAbs, entry);

export const recordProposalEnteredReview = async (input: {
	readonly logPathAbs: string;
	readonly proposalId: string;
	readonly from: string;
	readonly ts?: string;
}): Promise<void> =>
	appendPeerReviewLogEntry(input.logPathAbs, {
		kind: 'transition',
		ts: input.ts ?? new Date().toISOString(),
		proposalId: input.proposalId,
		from: input.from,
		to: 'review',
	});

export const recordProposalReviewAction = async (input: {
	readonly logPathAbs: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly action: 'submit' | 'approve' | 'request_changes';
	readonly implementer: string | null;
	readonly reviewer: string | null;
	readonly verdict?: 'approved' | 'requested_changes';
	readonly ts?: string;
}): Promise<void> =>
	appendPeerReviewLogEntry(input.logPathAbs, {
		kind: 'review',
		ts: input.ts ?? new Date().toISOString(),
		proposalId: input.proposalId,
		sliceId: input.sliceId,
		action: input.action,
		implementer: input.implementer,
		reviewer: input.reviewer,
		...(input.verdict !== undefined ? { verdict: input.verdict } : {}),
	});

export const readPeerReviewLog = async (
	logPathAbs: string,
): Promise<readonly IPeerReviewLogEntry[]> => {
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(logPathAbs)).readText(
				basename(logPathAbs),
			)
		).content;
	} catch (err) {
		// x00154 S6 — missing file is a legitimate "no history yet"
		// state. Every other read failure (permissions, EIO, …) is
		// surfaced via the typed error so callers can refuse to make
		// a decision rather than silently treating it as empty.
		if (isMissingFileErrno(err)) return [];
		throw new PeerReviewLogUnreadableError(err);
	}
	if (raw.trim() === '') {
		// x00154 S6 — an empty but present log is not the same as a
		// missing log. Surface the difference so tool envelopes can
		// map it to `{ ok: false, error: 'no-log-readable' }`.
		throw new PeerReviewLogUnreadableError('empty peer-review log');
	}
	return raw
		.split(/\r?\n/)
		.map(parseEntry)
		.filter((entry): entry is IPeerReviewLogEntry => entry !== null);
};

export const hasIndependentApprovalSinceLastReview = async (
	logPathAbs: string,
	proposalId: string,
): Promise<boolean> => {
	const entries = (await readPeerReviewLog(logPathAbs)).filter(
		(entry) => entry.proposalId === proposalId,
	);
	let lastReviewTs: string | undefined;
	for (const entry of entries) {
		if (entry.kind === 'transition' && entry.to === 'review') {
			if (lastReviewTs === undefined || entry.ts > lastReviewTs) {
				lastReviewTs = entry.ts;
			}
		}
	}
	return entries.some((entry) => {
		if (entry.kind !== 'review') return false;
		if (entry.verdict !== 'approved') return false;
		if (lastReviewTs !== undefined && entry.ts < lastReviewTs) return false;
		const reviewer = entry.reviewer?.trim().toLowerCase() ?? '';
		const implementer = entry.implementer?.trim().toLowerCase() ?? '';
		if (reviewer.length === 0) return false;
		return implementer.length === 0 || reviewer !== implementer;
	});
};
