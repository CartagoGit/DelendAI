/**
 * proposal-summaries.service.ts — the proposal registry as catalog
 * summaries.
 *
 * It lived in core, which then knew where this plugin keeps its registry
 * and what its entries hold: the inversion core must not carry. The plugin
 * owns the registry, so it owns this reader. It turns the plugin's
 * proposal index into typed `IProposalSummary[]`, reading through the
 * index reader, so the state database serves it wherever the project has
 * one and the regenerable `<cacheDir>/proposals/index.json` only where it
 * does not.
 */
import { join } from 'node:path';

import type { IProposalSummary } from '@delendai/core/public';

import {
	readProposalIndex,
	type IProposalIndexEntry,
	type IProposalIndexReadOptions,
} from './index-reader';

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
 * What a summary is built from: an index entry, or a registry entry read
 * as it was written, where nothing is guaranteed to be present.
 */
type TProposalSummarySource = Partial<
	Pick<
		IProposalIndexEntry,
		'id' | 'title' | 'track' | 'status' | 'kind' | 'date'
	>
>;

/**
 * Index entries as catalog summaries. Pure: callers that already hold
 * the entries (a registry scanned in memory) map them without a read.
 */
export const toProposalSummaries = (
	entries: readonly TProposalSummarySource[],
): readonly IProposalSummary[] =>
	entries.flatMap((entry) => {
		const id = entry.id;
		if (typeof id !== 'string' || id.length === 0) return [];
		return [
			{
				id,
				title: entry.title ?? id,
				track: entry.track ?? 'unspecified',
				status: normalizeProposalStatus(entry.status),
				// The plugin owns the kind vocabulary and records each
				// proposal's kind; deriving it from the id is only for an entry
				// without one.
				kind:
					typeof entry.kind === 'string' && entry.kind.length > 0
						? (entry.kind as IProposalSummary['kind'])
						: proposalKindFromId(id),
				date: entry.date ?? '',
			},
		];
	});

/**
 * The proposals as catalog summaries, read through the plugin's index
 * reader: from the state database by default, from the registry only
 * where the project chose it or has no database.
 */
export const readProposalsIndex = async (
	workspaceRoot: string,
	cacheDir: string,
	options?: IProposalIndexReadOptions,
): Promise<readonly IProposalSummary[]> => {
	try {
		return toProposalSummaries(
			await readProposalIndex(
				join(workspaceRoot, cacheDir, 'proposals', 'index.json'),
				undefined,
				options,
			),
		);
	} catch {
		// No projection could be read: the snapshot says nothing rather
		// than fail the overview it is part of.
		return [];
	}
};
