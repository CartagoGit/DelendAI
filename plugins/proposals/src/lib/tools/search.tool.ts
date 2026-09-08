import { existsSync } from 'node:fs';

import z from 'zod';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	createProposalSearchService,
	legacyProposalSearch,
	type IProposalSearchHit,
} from '../services/search';

export const PROPOSALS_SEARCH_REGISTRATION_ID = 'proposals_search';

export const proposalsSearchInputSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().positive().max(100).default(20),
	offset: z.number().int().nonnegative().default(0),
	kind: z.string().min(1).optional(),
	status: z.string().min(1).optional(),
	prefix: z.boolean().optional().default(false),
	mode: z.enum(['fts', 'legacy']).optional().default('fts'),
});

export const proposalsSearchOutputSchema = z.object({
	hits: z.array(
		z.object({
			uid: z.string(),
			kind: z.string(),
			status: z.string(),
			title: z.string(),
			snippet: z.string(),
			score: z.number(),
		}),
	),
	query: z.string(),
	mode: z.enum(['fts', 'legacy']),
});

export type IProposalsSearchOutput = z.infer<
	typeof proposalsSearchOutputSchema
>;

export interface IProposalsSearchToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
}

export const runProposalsSearch = async (
	options: IProposalsSearchToolOptions,
	input: z.input<typeof proposalsSearchInputSchema>,
): Promise<IProposalsSearchOutput> => {
	const parsed = proposalsSearchInputSchema.parse(input);
	const searchOptions = {
		query: parsed.query,
		limit: parsed.limit,
		offset: parsed.offset,
		...(parsed.kind === undefined ? {} : { kind: parsed.kind }),
		...(parsed.status === undefined ? {} : { status: parsed.status }),
		...(parsed.prefix === undefined ? {} : { prefix: parsed.prefix }),
	};
	if (parsed.mode === 'legacy') {
		const hits = await legacyProposalSearch({
			...searchOptions,
			indexPathAbs: options.indexPathAbs,
			proposalsDirAbs: options.proposalsDirAbs,
		});
		return { hits: [...hits], query: parsed.query, mode: 'legacy' };
	}
	const sqlitePath = resolveProposalsDbPaths(
		options.workspaceRoot,
	).databasePath;
	if (!existsSync(sqlitePath))
		return { hits: [], query: parsed.query, mode: 'fts' };
	const driver = new ProposalsSqliteDriver({
		path: sqlitePath,
		readonly: true,
	});
	try {
		const service = createProposalSearchService(driver);
		const hits = await service.search(searchOptions);
		return { hits: [...hits], query: parsed.query, mode: 'fts' };
	} finally {
		driver.close();
	}
};

export const buildSearchToolRegistration = (
	options: IProposalsSearchToolOptions,
): IToolRegistration => ({
	id: PROPOSALS_SEARCH_REGISTRATION_ID,
	disclosure: 'administrative',
	summary: 'Search proposals, plans, and slices with SQLite FTS5.',
	tags: ['proposals', 'read', 'search'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_search`,
			{
				description:
					'Search proposal titles with SQLite FTS5. The legacy mode preserves the old title substring scan.',
				inputSchema: proposalsSearchInputSchema,
				outputSchema: proposalsSearchOutputSchema,
			},
			async (input) => toolJson(await runProposalsSearch(options, input)),
		);
	},
});

export type { IProposalSearchHit };
