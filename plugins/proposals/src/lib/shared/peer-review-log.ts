import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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

export const appendPeerReviewLogEntry = async (
	logPathAbs: string,
	entry: IPeerReviewLogEntry,
): Promise<void> => {
	await mkdir(dirname(logPathAbs), { recursive: true });
	await appendFile(logPathAbs, `${JSON.stringify(entry)}\n`, 'utf8');
};

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
	const raw = await readFile(logPathAbs, 'utf8').catch(() => '');
	if (raw.trim() === '') return [];
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
