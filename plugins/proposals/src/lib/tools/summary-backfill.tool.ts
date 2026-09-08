import { existsSync } from 'node:fs';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
	summaryBackfill,
	type ISummaryBackfillProposal,
} from '@delendai/proposals-sqlite';

export const summaryBackfillInputSchema = z.object({
	kind: z.string().min(1).optional(),
	uid: z.string().min(1).optional(),
	summaryModel: z.string().min(1).default('external'),
	summaryPromptVersion: z.string().min(1).default('v1'),
});

export const summaryBackfillOutputSchema = z.object({
	considered: z.number().int().nonnegative(),
	created: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
});

export type ISummaryBackfillToolOptions = {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
	readonly summarize?: (
		proposal: ISummaryBackfillProposal,
	) => string | Promise<string>;
};

export const runSummaryBackfill = async (
	options: ISummaryBackfillToolOptions,
	input: z.input<typeof summaryBackfillInputSchema>,
) => {
	const args = summaryBackfillInputSchema.parse(input);
	const sqlitePath = resolveProposalsDbPaths(
		options.workspaceRoot,
	).databasePath;
	if (!existsSync(sqlitePath)) {
		return { considered: 0, created: 0, skipped: 0 };
	}
	const driver = new ProposalsSqliteDriver({ path: sqlitePath });
	try {
		const backfillArgs = {
			summaryModel: args.summaryModel,
			summaryPromptVersion: args.summaryPromptVersion,
			...(args.kind === undefined ? {} : { kind: args.kind }),
			...(args.uid === undefined ? {} : { uid: args.uid }),
			summarize: options.summarize ?? ((proposal) => proposal.title),
		};
		return await summaryBackfill(driver.handle, backfillArgs);
	} finally {
		driver.close();
	}
};

export const buildSummaryBackfillToolRegistration = (
	options: ISummaryBackfillToolOptions,
): IToolRegistration => ({
	id: 'proposals_summary_backfill',
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_summary_backfill`,
			{
				title: 'Backfill proposal summaries',
				description:
					'Populate the content-hash summary cache for proposals that do not have a cached summary.',
				inputSchema: summaryBackfillInputSchema.shape,
				outputSchema: summaryBackfillOutputSchema.shape,
			},
			async (args) => {
				const output = await runSummaryBackfill(options, args ?? {});
				return {
					content: [
						{ type: 'text' as const, text: JSON.stringify(output) },
					],
					structuredContent: { ...output },
				};
			},
		);
	},
});
