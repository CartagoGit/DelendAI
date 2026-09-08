// effect-boundary-authorized: existsSync guards the bun:sqlite open. The
// driver opens the database file itself, outside ctx.effects, so mediating
// only the existence probe would suggest a supervision that does not exist.

import { existsSync } from 'node:fs';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
	type IQuarantineRecord,
} from '@delendai/proposals-sqlite';

export interface IQuarantineToolOptions {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
}

export const quarantineEntrySchema = z.object({
	id: z.number().int().positive(),
	sourcePath: z.string(),
	blobSha: z.string(),
	entityGuess: z.string().nullable(),
	errorCode: z.string(),
	errorMessage: z.string(),
	rawMetadata: z.string().nullable(),
	runId: z.number().int().positive(),
	status: z.enum(['pending', 'resolved', 'ignored']),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	resolvedAt: z.number().int().nonnegative().nullable(),
	resolvedBy: z.string().nullable(),
	resolutionNote: z.string().nullable(),
});

export const quarantineOutputSchema = z.object({
	entries: z.array(quarantineEntrySchema),
	total: z.number().int().nonnegative(),
	runCount: z.number().int().nonnegative(),
});

export type IQuarantineListOutput = z.infer<typeof quarantineOutputSchema>;

const toOutput = (
	entries: readonly IQuarantineRecord[],
): IQuarantineListOutput => ({
	entries: entries.filter(
		(entry): entry is IQuarantineRecord & { readonly runId: number } =>
			entry.runId !== null,
	),
	total: entries.filter((entry) => entry.runId !== null).length,
	runCount: new Set(
		entries.flatMap((entry) => (entry.runId === null ? [] : [entry.runId])),
	).size,
});

export const runQuarantineList = (
	options: IQuarantineToolOptions,
): IQuarantineListOutput => {
	const sqlitePath = resolveProposalsDbPaths(
		options.workspaceRoot,
	).databasePath;
	if (!existsSync(sqlitePath)) return { entries: [], total: 0, runCount: 0 };
	const driver = new ProposalsSqliteDriver({
		path: sqlitePath,
		readonly: true,
	});
	try {
		const rows = driver.handle
			.query<IQuarantineRecord, []>(
				`SELECT id, source_path AS sourcePath, blob_sha AS blobSha,
						entity_guess AS entityGuess, error_code AS errorCode,
						error_message AS errorMessage, raw_metadata AS rawMetadata,
						run_id AS runId, status, created_at AS createdAt,
						updated_at AS updatedAt, resolved_at AS resolvedAt,
						resolved_by AS resolvedBy, resolution_note AS resolutionNote
				 FROM quarantine
				 WHERE run_id IS NOT NULL
				 ORDER BY created_at ASC, id ASC`,
			)
			.all();
		return toOutput(rows);
	} finally {
		driver.close();
	}
};

export const buildQuarantineListToolRegistration = (
	options: IQuarantineToolOptions,
): IToolRegistration => ({
	id: 'proposals_db_quarantine_list',
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_db_quarantine_list`,
			{
				title: 'List quarantined proposals (read-only)',
				description:
					'Read-only listing of SQLite quarantine entries. Never writes.',
				inputSchema: z.object({}),
				outputSchema: quarantineOutputSchema,
			},
			async () => {
				const output = runQuarantineList(options);
				return {
					content: [
						{ type: 'text' as const, text: JSON.stringify(output) },
					],
					structuredContent: output,
				};
			},
		);
	},
});
