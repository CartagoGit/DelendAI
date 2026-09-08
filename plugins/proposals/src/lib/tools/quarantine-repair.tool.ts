import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import {
	OutboxRepo,
	ProposalRepo,
	ProposalsSqliteDriver,
	QuarantineRepo,
	reconcileProposalMarkdown,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	quarantineOutputSchema,
	runQuarantineList,
	type IQuarantineListOutput,
	type IQuarantineToolOptions,
} from './quarantine-list.tool';

export const quarantineRepairInputSchema = z.object({
	id: z.number().int().positive(),
	action: z.enum(['re-parse', 'mark-resolved', 'mark-ignored']),
	note: z.string().optional(),
});

export type IQuarantineRepairArgs = z.infer<typeof quarantineRepairInputSchema>;

const safeSourcePath = (root: string, sourcePath: string): string => {
	const absolute = isAbsolute(sourcePath)
		? resolve(sourcePath)
		: resolve(root, sourcePath);
	const relativePath = relative(resolve(root), absolute);
	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new Error('quarantine source path escapes workspace root');
	}
	return absolute;
};

export const runQuarantineRepair = (
	options: IQuarantineToolOptions,
	args: IQuarantineRepairArgs,
): IQuarantineListOutput => {
	const sqlitePath = resolveProposalsDbPaths(
		options.workspaceRoot,
	).databasePath;
	if (!existsSync(sqlitePath)) return { entries: [], total: 0, runCount: 0 };
	const driver = new ProposalsSqliteDriver({ path: sqlitePath });
	try {
		const repo = new QuarantineRepo(driver.handle);
		const row = driver.handle
			.query<
				{
					id: number;
					source_path: string;
					blob_sha: string;
					run_id: number;
				},
				[number]
			>(
				`SELECT id, source_path, blob_sha, run_id
				 FROM quarantine WHERE id = ?`,
			)
			.get(args.id);
		if (!row) throw new Error(`Unknown quarantine id: ${String(args.id)}`);

		if (args.action === 'mark-ignored' || args.action === 'mark-resolved') {
			repo.resolve({
				id: args.id,
				status: args.action === 'mark-ignored' ? 'ignored' : 'resolved',
				resolvedBy: 'proposals_db_quarantine_repair',
				resolutionNote: args.note ?? null,
			});
			return runQuarantineList(options);
		}

		const sourcePath = safeSourcePath(
			options.workspaceRoot,
			row.source_path,
		);
		if (!existsSync(sourcePath)) {
			throw new Error(
				`quarantine source file is missing: ${row.source_path}`,
			);
		}
		const raw = readFileSync(sourcePath, 'utf8');
		const parsed = reconcileProposalMarkdown({
			sourceCommit: 'quarantine-repair',
			mode: 'incremental',
			files: [{ path: row.source_path, raw, sha: row.blob_sha }],
		});
		const candidate = parsed.proposals[0];
		if (candidate === undefined || parsed.quarantined.length > 0) {
			throw new Error(
				'current parser still rejects the quarantined file',
			);
		}
		const outcome = new ProposalRepo(driver.handle).upsertProjection(
			candidate,
		);
		if (outcome.kind === 'created' || outcome.kind === 'updated') {
			new OutboxRepo(driver.handle).enqueue({
				idempotencyKey: `quarantine-repair:${String(args.id)}:${String(outcome.proposal.revision)}`,
				kind: 'regenerate-index',
				payload: JSON.stringify({
					uid: outcome.proposal.uid,
					action: 'quarantine-repair',
				}),
			});
		}
		repo.resolve({
			id: args.id,
			status: 'resolved',
			resolvedBy: 'proposals_db_quarantine_repair',
			resolutionNote: args.note ?? 're-parsed successfully',
		});
		return runQuarantineList(options);
	} finally {
		driver.close();
	}
};

export const buildQuarantineRepairToolRegistration = (
	options: IQuarantineToolOptions,
): IToolRegistration => ({
	id: 'proposals_db_quarantine_repair',
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_db_quarantine_repair`,
			{
				title: 'Repair a quarantined proposal',
				description:
					'Explicitly re-parse or mark a quarantine entry resolved or ignored. Never silently deletes entries.',
				inputSchema: quarantineRepairInputSchema,
				outputSchema: quarantineOutputSchema,
			},
			async (args) => {
				const output = runQuarantineRepair(
					options,
					quarantineRepairInputSchema.parse(args ?? {}),
				);
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
