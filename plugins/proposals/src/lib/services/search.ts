// effect-boundary-authorized: reads the proposals index and markdown to
// answer a read-only search when the SQL projection cannot serve it. Same
// files git tracks, no writes.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import type { ProposalsSqliteDriver } from '@delendai/proposals-sqlite';

import { readProposalIndex } from '../proposals/index-reader';

/** Tokens of context FTS5 puts around a match in the returned snippet. */
const SNIPPET_TOKEN_COUNT = 12;

export interface IProposalSearchHit {
	readonly uid: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly snippet: string;
	readonly score: number;
}

export interface IProposalSearchOptions {
	readonly query: string;
	readonly limit: number;
	readonly offset: number;
	readonly kind?: string;
	readonly status?: string;
	readonly prefix?: boolean;
}

export interface IProposalSearchService {
	readonly search: (
		options: IProposalSearchOptions,
	) => Promise<readonly IProposalSearchHit[]>;
}

interface IStoredSearchRow {
	readonly uid: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly snippet: string | null;
	readonly score: number;
}

const buildMatchExpression = (query: string, prefix: boolean): string => {
	const normalized = query.trim();
	if (!prefix) return normalized;
	return `${normalized}*`;
};

const buildSql = (options: IProposalSearchOptions): string => {
	const filters = ['proposals_fts MATCH ?'];
	if (options.kind !== undefined) filters.push('p.kind = ?');
	if (options.status !== undefined) filters.push('p.status = ?');
	return `SELECT p.uid, p.kind, p.status, p.title,
			snippet(proposals_fts, 1, '<b>', '</b>', '...', ${String(SNIPPET_TOKEN_COUNT)}) AS snippet,
			bm25(proposals_fts) AS score
		FROM proposals_fts
		JOIN proposals AS p ON p.uid = proposals_fts.uid
		WHERE ${filters.join(' AND ')}
		ORDER BY score ASC, p.uid ASC
		LIMIT ? OFFSET ?`;
};

export const createProposalSearchService = (
	driver: ProposalsSqliteDriver,
): IProposalSearchService => ({
	search: async (options) => {
		const params: Array<string | number> = [
			buildMatchExpression(options.query, options.prefix === true),
		];
		if (options.kind !== undefined) params.push(options.kind);
		if (options.status !== undefined) params.push(options.status);
		params.push(options.limit, options.offset);
		const rows = driver.handle
			.query<IStoredSearchRow, Array<string | number>>(buildSql(options))
			.all(...params);
		return rows.map((row) => ({
			uid: row.uid,
			kind: row.kind,
			status: row.status,
			title: row.title,
			snippet: row.snippet ?? row.title,
			score: row.score,
		}));
	},
});

export interface ILegacyProposalSearchOptions extends IProposalSearchOptions {
	readonly indexPathAbs: string;
	readonly proposalsDirAbs: string;
}

export const legacyProposalSearch = async (
	options: ILegacyProposalSearchOptions,
): Promise<readonly IProposalSearchHit[]> => {
	if (!existsSync(options.indexPathAbs)) return [];
	const entries = await readProposalIndex(options.indexPathAbs);
	const query = options.query.toLocaleLowerCase();
	const loaded = await Promise.all(
		entries.map(async (entry) => {
			const path = entry.file.startsWith('/')
				? entry.file
				: `${options.proposalsDirAbs}/${entry.file}`;
			try {
				const raw = await readFile(path, 'utf8');
				const title =
					raw.match(/^title:\s*["']?(.+?)["']?\s*$/mu)?.[1]?.trim() ??
					raw.match(/^#\s+(.+)$/mu)?.[1]?.trim() ??
					entry.id;
				if (!title.toLocaleLowerCase().includes(query)) return null;
				return {
					uid: entry.id,
					kind: 'unknown',
					status: entry.status,
					title,
					snippet: title,
					score: 0,
				};
			} catch {
				return null;
			}
		}),
	);
	return loaded
		.filter((hit): hit is IProposalSearchHit => hit !== null)
		.slice(options.offset, options.offset + options.limit);
};
