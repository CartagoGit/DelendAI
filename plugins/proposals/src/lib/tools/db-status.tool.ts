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
 *   - `indexes`: `runtime` — whether
 *     `.cache/delendai/proposals/index.json`, the index the plugin
 *     ACTUALLY reads, exists — plus whether the legacy docs
 *     INDEX.json files exist on disk (their existence does not imply
 *     they are read by the plugin; see r00049).
 *   - `lastSyncAt`: the most recent `reconciliation_runs.completed_at`
 *     timestamp; `null` when there is no DB.
 *   - `quarantineCount`: how many entries the quarantine has (f00515).
 *
 * When the proposals DB does not exist, the tool still returns a
 * coherent `{ exists: false, proposals: 0, plans: 0, slices: 0,
 * quarantineCount: 0 }` shape — never an error. The host can decide
 * whether to bootstrap a fresh DB.
 */
// effect-boundary-authorized: read-only fs.statSync + path.join for the
// proposals DB file size and existence — this is a stat-only diagnostic,
// the proposals DB lifecycle goes through ctx.effects / repo adapters.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';
import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import {
	assertReadOnlyCall,
	type IProposalReader,
} from '../contracts/interfaces/materializer.interface';

export interface IDbStatusToolOptions {
	/**
	 * Workspace root. The database path is derived from it by
	 * `resolveProposalsDbPaths` (x00533 S1) — the ONE function that
	 * decides where `proposals.sqlite` lives. This tool must never
	 * build that path with a hand-written `join`, or it diagnoses a
	 * different file from the one the reconciler writes.
	 */
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	/** Namespace prefix for the wire-level tool name. */
	readonly namespacePrefix?: string;
	readonly proposalsSqlitePath?: string;
	/**
	 * Absolute path of the index the RUNTIME actually reads
	 * (`.cache/delendai/proposals/index.json`). Defaults to that path
	 * under `workspaceRoot`. The docs `INDEX.json` files reported
	 * alongside it are NOT what the plugin reads (r00049).
	 */
	readonly runtimeIndexPathAbs?: string;
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
		/** `.cache/delendai/proposals/index.json` — what the plugin reads. */
		runtime: z.boolean(),
		/** Absolute path of the runtime index, so the operator can look. */
		runtimePath: z.string(),
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

/**
 * The index the proposals runtime actually consumes, relative to the
 * workspace root. Kept as data so the spec can assert it without
 * re-typing the string.
 */
export const RUNTIME_INDEX_RELATIVE_PATH =
	'.cache/delendai/proposals/index.json';

/** Wire-level tool name suffix; the namespace prefix is prepended. */
export const DB_STATUS_TOOL_SUFFIX = 'db_status';

/** Registration id, as it appears in the plugin's tool list. */
export const DB_STATUS_REGISTRATION_ID = 'proposals_db_status';

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
		resolveProposalsDbPaths(options.workspaceRoot).databasePath;
	const indexFiles = options.indexFiles ?? DEFAULT_INDEX_FILES;
	const runtimeIndexPath =
		options.runtimeIndexPathAbs ??
		join(options.workspaceRoot, RUNTIME_INDEX_RELATIVE_PATH);
	// x00533 S2: tool name derives from the registration id
	// (`proposals_db_status`). The namespacing pass in plugin.ts ALREADY
	// prepends the namespacePrefix to the id (`work` namespace turns
	// `proposals_db_status` into `work_proposals_db_status`); doing it here
	// too would double-prefix to `proposals_proposals_db_status` and break
	// tests that expect the canonical id. Only emit a different prefix when
	// the host asks for one that is NOT the canonical `proposals` prefix.
	const ns = options.namespacePrefix ?? 'proposals';
	const toolName =
		ns === 'proposals'
			? DB_STATUS_REGISTRATION_ID
			: `${ns}_${DB_STATUS_REGISTRATION_ID}`;

	// S3: enforce READ != WRITE at construction time. The static
	// type already excludes `materializer`; the runtime guard is a
	// defence-in-depth backstop for any future change that bypasses the
	// type system. We scan the full options bag (not just `reader`) so
	// a sneaked-in `materializer` field still trips the check.
	assertReadOnlyCall(
		'proposals_db_status',
		options as unknown as Readonly<Record<string, unknown>>,
	);

	return {
		id: DB_STATUS_REGISTRATION_ID,
		// Administrative: a diagnostic an operator reaches for, never
		// the next step of the authoring flow. Declared here rather
		// than through `applyProposalsDisclosure` so the level travels
		// with the builder.
		disclosure: 'administrative',
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					title: 'Proposals DB status (read-only)',
					description:
						'Read-only diagnostic of the proposals operational DB. Returns counts, last sync, quarantine size, and the existence of both the runtime index (.cache/delendai/proposals/index.json) and the legacy docs INDEX.json files. Never writes.',
					inputSchema: proposalsDbStatusInputSchema,
					outputSchema: proposalsDbStatusOutputSchema,
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
						runtime: existsSync(runtimeIndexPath),
						runtimePath: runtimeIndexPath,
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
