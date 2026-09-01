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

/**
 * `appendPeerReviewJsonl` deliberately accepts two shapes into one file
 * (see its doc comment): the typed camel-case entries written here, and
 * the snake_case journal `proposal_review` writes from the authoring
 * tool — `{ ts, proposal_id, slice_id, agent, verdict }`.
 *
 * The reader only ever understood the first, and silently produced
 * entries with `kind: undefined` for the second, which every predicate
 * then filtered out. Real independent approvals sat in the log, on disk,
 * invisible to the gate that was refusing to close the proposal because
 * it could not find them.
 *
 * The snake_case entry carries no `implementer`, because independence is
 * enforced at WRITE time by `checkApproveIdentity` (reviewer ≠
 * submitter, recorded in `review-identity.jsonl`). An entry that exists
 * was therefore already validated as independent, which is exactly what
 * the empty-implementer branch of the predicate below assumes.
 */
const normalizeLegacyReviewEntry = (
	value: Record<string, unknown>,
): IPeerReviewLogEntry | null => {
	const proposalId = value.proposal_id;
	const verdict = value.verdict;
	const agent = value.agent;
	const ts = value.ts;
	if (
		typeof proposalId !== 'string' ||
		typeof ts !== 'string' ||
		typeof agent !== 'string' ||
		(verdict !== 'approved' && verdict !== 'request_changes')
	) {
		return null;
	}
	return {
		kind: 'review',
		ts,
		proposalId,
		sliceId: typeof value.slice_id === 'string' ? value.slice_id : '',
		action: verdict === 'approved' ? 'approve' : 'request_changes',
		reviewer: agent,
		verdict,
	} as IPeerReviewLogEntry;
};

const parseEntry = (line: string): IPeerReviewLogEntry | null => {
	if (line.trim() === '') return null;
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return null;
	}
	if (value === null || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (typeof record.kind === 'string') {
		return record as unknown as IPeerReviewLogEntry;
	}
	return normalizeLegacyReviewEntry(record);
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
	// The recency cut-off exists to stop a RE-OPENED proposal from reusing
	// the approval it earned before the changes that re-opened it. It must
	// therefore key on a re-opening, not on entering review at all.
	//
	// The log only records transitions INTO review, so a re-opening is
	// exactly a SECOND such entry: you cannot enter review twice without
	// leaving it in between. On a first pass there is only one, and every
	// slice approval necessarily predates it — slices are approved while
	// the proposal is still `ready`/`in-progress`, and only once they are
	// all approved does it become closure-ready.
	//
	// Cutting off at the first entry therefore rejected every approval a
	// first-time closure could possibly have, and `proposal_review` refuses
	// to re-approve an already-approved slice, so nothing could satisfy the
	// gate: 128 proposals with every slice done and approved were stranded
	// behind a requirement with no reachable path.
	const reviewEntryTimestamps = entries
		.filter((entry) => entry.kind === 'transition' && entry.to === 'review')
		.map((entry) => entry.ts)
		.sort();
	const reopenedAt =
		reviewEntryTimestamps.length > 1
			? reviewEntryTimestamps.at(-1)
			: undefined;
	return entries.some((entry) => {
		if (entry.kind !== 'review') return false;
		if (entry.verdict !== 'approved') return false;
		if (reopenedAt !== undefined && entry.ts < reopenedAt) return false;
		const reviewer = entry.reviewer?.trim().toLowerCase() ?? '';
		const implementer = entry.implementer?.trim().toLowerCase() ?? '';
		if (reviewer.length === 0) return false;
		return implementer.length === 0 || reviewer !== implementer;
	});
};
