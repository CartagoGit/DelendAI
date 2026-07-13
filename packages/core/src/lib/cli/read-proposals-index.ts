/**
 * read-proposals-index.ts — Reads the proposal registry from the cache.
 *
 * Extracted from `assemble.ts` (SRP): the proposal-index reader is a
 * self-contained concern that parses the regenerable cache artifact
 * `<cacheDir>/proposals/index.json` into typed `IProposalSummary[]`.
 * Pure except for the injectable file-reader.
 */
import { join } from 'node:path';

import type { IProposalSummary } from '../catalog/agent-discovery-types';

interface IProposalIndexFileEntry {
	readonly id?: string;
	readonly title?: string;
	readonly track?: string;
	readonly status?: string;
	readonly type?: string;
	readonly kind?: string;
	readonly date?: string;
}

interface IProposalIndexFile {
	readonly proposals?: readonly IProposalIndexFileEntry[];
}

/** Derive the proposal kind from its id prefix (f→feat, r→refactor, …). */
export const proposalKindFromId = (id: string): IProposalSummary['kind'] => {
	const prefix = id[0]?.toLowerCase();
	if (prefix === 'f') return 'feat';
	if (prefix === 'r') return 'refactor';
	if (prefix === 'c') return 'chore';
	if (prefix === 'd') return 'docs';
	if (prefix === 'q') return 'plan';
	if (prefix === 'a') return 'audit';
	if (prefix === 'x') return 'fix';
	return 'unspecified';
};

/** Normalize a raw status string to the known proposal status union. */
export const normalizeProposalStatus = (
	status: string | undefined,
): IProposalSummary['status'] => {
	if (
		status === 'ready' ||
		status === 'in-progress' ||
		status === 'review' ||
		status === 'paused' ||
		status === 'done' ||
		status === 'blocked' ||
		status === 'retired'
	) {
		return status;
	}
	return 'unspecified';
};

/**
 * Read the proposals registry index from the cache and return typed
 * summaries. The index is a regenerable artifact, not a human-edited
 * source file (x00052).
 */
export const readProposalsIndex = async (
	workspaceRoot: string,
	cacheDir: string,
	readWorkspaceFile: (absolutePath: string) => Promise<string | undefined>,
): Promise<readonly IProposalSummary[]> => {
	const raw = await readWorkspaceFile(
		join(workspaceRoot, cacheDir, 'proposals', 'index.json'),
	);
	if (raw === undefined) return [];
	let parsed: IProposalIndexFile;
	try {
		parsed = JSON.parse(raw) as IProposalIndexFile;
	} catch {
		return [];
	}
	if (!Array.isArray(parsed.proposals)) return [];
	return parsed.proposals
		.filter(
			(
				entry,
			): entry is Required<Pick<IProposalIndexFileEntry, 'id'>> &
				IProposalIndexFileEntry => typeof entry.id === 'string',
		)
		.map((entry) => ({
			id: entry.id,
			title: entry.title ?? entry.id,
			track: entry.track ?? 'unspecified',
			status: normalizeProposalStatus(entry.status),
			kind:
				entry.kind === 'feat' ||
				entry.kind === 'fix' ||
				entry.kind === 'refactor' ||
				entry.kind === 'chore' ||
				entry.kind === 'docs' ||
				entry.kind === 'plan' ||
				entry.kind === 'audit'
					? entry.kind
					: proposalKindFromId(entry.id),
			date: entry.date ?? '',
		}));
};
