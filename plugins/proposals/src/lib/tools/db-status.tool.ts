/**
 * db-status.tool.ts — x00510 S3.
 *
 * `proposals_db_status` — read-only diagnostic for the proposals DB.
 *
 * This is the single tool that an operator runs first when they
 * suspect the proposals DB is in an inconsistent state. It is
 * **strictly read-only**: it does NOT call any materializer, and
 * `assertReadOnlyCall` enforces that.
 *
 * Surface:
 *   - `proposals`: count of proposals in the active DB.
 *   - `plans`: count of plans in the active DB.
 *   - `slices`: count of slices in the active DB.
 *   - `indexes`: whether the legacy INDEX.json files exist on disk
 *     (their existence does not imply they are read by the plugin;
 *     see r00049).
 *   - `lastSyncAt`: the most recent `reconciliation_runs.completed_at`
 *     timestamp; `null` when there is no DB.
 *   - `quarantineCount`: how many entries the quarantine has (f00515).
 *
 * When the proposals DB does not exist, the tool still returns a
 * coherent `{ exists: false, proposals: 0, plans: 0, slices: 0,
 * quarantineCount: 0 }` shape — never an error. The host can decide
 * whether to bootstrap a fresh DB.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

import {
	assertReadOnlyCall,
	type IProposalReader,
} from '../contracts/interfaces/materializer.interface';

export interface IDbStatusToolOptions {
	readonly proposalsDirAbs: string;
	readonly proposalsSqlitePath?: string;
	readonly reader: IProposalReader;
	readonly indexFiles?: readonly string[];
	/**
	 * Optional materializer reference. Present only as a runtime
	 * tripwire: this tool is declared read-only, so any code path
	 * that wires one in is a violation. The static type system
	 * already prevents this; the guard is a defence-in-depth
	 * backstop that fails loudly even if a future change forces
	 * the type past the compiler.
	 */
	readonly materializer?: never;
}

/** Public schema, exported for downstream generators (apps/web, extensions/vscode). */
export const proposalsDbStatusInputSchema = z.object({
	includeQuarantine: z.boolean().optional(),
});

export const proposalsDbStatusOutputSchema = z.object({
	exists: z.boolean(),
	proposals: z.number().int().nonnegative(),
	plans: z.number().int().nonnegative(),
	slices: z.number().int().nonnegative(),
	indexes: z.object({
		root: z.boolean(),
		plans: z.boolean(),
		slices: z.boolean(),
	}),
	lastSyncAt: z.number().int().nonnegative().nullable(),
	sourceCommit: z.string().nullable(),
	quarantineCount: z.number().int().nonnegative(),
	databasePath: z.string(),
	databaseSizeBytes: z.number().int().nonnegative(),
	checkedAt: z.number().int().nonnegative(),
});

export type IProposalsDbStatusOutput = z.infer<
	typeof proposalsDbStatusOutputSchema
>;

export const DEFAULT_INDEX_FILES = [
	'INDEX.json',
	'plans/INDEX.json',
	'slices/INDEX.json',
] as const;

export const buildDbStatusToolRegistration = (
	options: IDbStatusToolOptions,
): IToolRegistration => {
	const sqlitePath =
		options.proposalsSqlitePath ??
		join(options.proposalsDirAbs, 'proposals.sqlite');
	const indexFiles = options.indexFiles ?? DEFAULT_INDEX_FILES;

	// x00510 S3: enforce READ != WRITE at construction time. The static
	// type already excludes `materializer`; the runtime guard is a
	// defence-in-depth backstop for any future change that bypasses the
	// type system. We scan the full options bag (not just `reader`) so
	// a sneaked-in `materializer` field still trips the check.
	assertReadOnlyCall(
		'proposals_db_status',
		options as unknown as Readonly<Record<string, unknown>>,
	);

	return {
		id: 'tool:proposals-db-status',
		register: async (server) => {
			server.registerTool(
				'proposals_db_status',
				{
					title: 'Proposals DB status (read-only)',
					description:
						'Read-only diagnostic of the proposals operational DB. Returns counts, last sync, quarantine size, and legacy INDEX.json existence. Never writes.',
					inputSchema: proposalsDbStatusInputSchema.shape,
					outputSchema: proposalsDbStatusOutputSchema.shape,
				},
				async (args) => {
					const includeQuarantine =
						(args as { includeQuarantine?: boolean })
							.includeQuarantine ?? false;

					const fileExists = existsSync(sqlitePath);
					const fileSize = fileExists ? statSync(sqlitePath).size : 0;

					let proposals = 0;
					let plans = 0;
					let slices = 0;
					let lastSyncAt: number | null = null;
					let sourceCommit: string | null = null;
					let quarantineCount = 0;

					if (fileExists) {
						try {
							const counts = await options.reader.count();
							proposals = counts.proposals;
							plans = counts.plans;
							slices = counts.slices;
							const sync = await options.reader.lastSync();
							lastSyncAt = sync.at ?? null;
							sourceCommit = sync.sourceCommit ?? null;
						} catch {
							// The DB may exist but be corrupt; surface counts as 0
							// rather than failing the tool. The host can decide to
							// run `proposals_db_rebuild --apply --confirm <sha>`.
							proposals = 0;
							plans = 0;
							slices = 0;
							lastSyncAt = null;
							sourceCommit = null;
						}
						if (includeQuarantine) {
							quarantineCount =
								await readQuarantineCount(sqlitePath);
						}
					}

					const indexes = {
						root: existsSync(
							join(
								options.proposalsDirAbs,
								indexFiles[0] ?? 'INDEX.json',
							),
						),
						plans: existsSync(
							join(
								options.proposalsDirAbs,
								indexFiles[1] ?? 'plans/INDEX.json',
							),
						),
						slices: existsSync(
							join(
								options.proposalsDirAbs,
								indexFiles[2] ?? 'slices/INDEX.json',
							),
						),
					};

					const output: IProposalsDbStatusOutput = {
						exists: fileExists,
						proposals,
						plans,
						slices,
						indexes,
						lastSyncAt,
						sourceCommit,
						quarantineCount,
						databasePath: sqlitePath,
						databaseSizeBytes: fileSize,
						checkedAt: Date.now(),
					};

					return toolOk(output);
				},
			);
		},
	};
};

/**
 * Count quarantine entries. Today we cannot read SQLite directly
 * because the proposals plugin does not own a SQLite dependency yet
 * (q00022 lands it). When the DB is missing or corrupt, the count is
 * 0; the surface is stable so downstream consumers do not have to
 * branch on the plugin's lifecycle phase.
 */
const readQuarantineCount = async (_sqlitePath: string): Promise<number> => {
	// Phase A: no SQLite yet. The count is 0. Phase B (q00022) replaces
	// this stub with a real SELECT COUNT(*) FROM quarantine.
	return 0;
};
