/**
 * auto-scaffold-proposals.service.ts — centralised auto-scaffolding
 * helper used by `audit_run` and `audit_consolidate`.
 *
 * Behaviour:
 *  - When the caller opt-in via `autoScaffoldProposals: true` AND the
 *    `proposals` peer plugin is loaded in the same MCP server, this
 *    helper delegates to the existing `scaffoldProposals(...)`
 *    primitive, writes each scaffolded proposal to the host
 *    `proposalsDir`, and returns the full set.
 *  - When the caller opt-in BUT `proposals` is not loaded, it returns
 *    an empty scaffold set and a structured `proposals_skipped`
 *    reason so the tool's output can surface "deferred — install the
 *    proposals plugin to close the loop".
 *  - When the caller opt-OUT, it returns `disabled` regardless of
 *    peer availability.
 *
 * Pure worker: no state, no globals. The IO happens in the caller,
 * which uses `writeFileAtomic` per the durable-writes hard rule.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { IPeerPluginRegistry } from '@mcp-vertex/core/public';
import { writeFileAtomic } from '@mcp-vertex/core/public';

import type { IConsolidation } from '../contracts/interfaces/audit.interface';

import {
	scaffoldProposals,
	type IScaffoldedProposal,
} from './proposal-scaffolder.service';

export interface IAutoScaffoldOptions {
	/** Caller's opt-in flag. When false, the helper returns `disabled`. */
	readonly enabled: boolean;
	/** Peer-plugin registry — used to detect the `proposals` plugin. */
	readonly peerPlugins: IPeerPluginRegistry | undefined;
	/** Workspace-relative proposals dir. Default: ready proposals dir. */
	readonly proposalsDir: string;
	/** Absolute workspace root, used to resolve the output dir. */
	readonly workspaceRoot: string;
	/** Ids known to the registry so the scaffolder skips them. */
	readonly knownProposalIds?: ReadonlySet<string>;
	/** Originating audit id to attach to each proposal. */
	readonly auditId?: string;
	/** First numeric id to attempt when allocating new ids. */
	readonly startAt?: number;
	/** Prefix for the new proposals (defaults inside the scaffolder). */
	readonly prefix?: string;
	/**
	 * ISO date (`YYYY-MM-DD`) for the file date stamping. Default:
	 * today UTC.
	 */
	readonly date?: string;
}

export type AutoScaffoldOutcome =
	| {
			readonly kind: 'scaffolded';
			readonly records: readonly IScaffoldedProposal[];
	  }
	| { readonly kind: 'disabled' }
	| {
			readonly kind: 'skipped';
			readonly reason: 'proposals-not-loaded';
	  };

/**
 * Resolve `proposals` peer availability and (when opted in + present)
 * run the scaffolder end-to-end. Returns a discriminated outcome so
 * the tool can serialise it into the output unchanged.
 */
export const resolveAutoScaffold = async (
	consolidation: IConsolidation,
	options: IAutoScaffoldOptions,
): Promise<AutoScaffoldOutcome> => {
	if (!options.enabled) return { kind: 'disabled' };
	const proposalsLoaded = options.peerPlugins?.has('proposals') ?? false;
	if (!proposalsLoaded) {
		return { kind: 'skipped', reason: 'proposals-not-loaded' };
	}

	// Run the scaffolder to get the in-memory records, then write each
	// one to disk with `writeFileAtomic` (the durability boundary).
	const records = scaffoldProposals(consolidation, {
		...(options.knownProposalIds !== undefined
			? { existingIds: options.knownProposalIds }
			: {}),
		...(options.startAt !== undefined ? { startAt: options.startAt } : {}),
		...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
		outputDir: options.proposalsDir,
		...(options.auditId !== undefined ? { auditId: options.auditId } : {}),
		...(options.date !== undefined ? { date: options.date } : {}),
	});
	if (records.length === 0) {
		return { kind: 'scaffolded', records: [] };
	}

	// Resolve the absolute output dir; the host might pass either
	// an absolute path or a workspace-relative one. Mirror the
	// `audit_run` containment helper semantics: absolute paths are
	// trusted, workspace-relative ones resolve against `workspaceRoot`.
	const absDir = path.isAbsolute(options.proposalsDir)
		? options.proposalsDir
		: path.join(options.workspaceRoot, options.proposalsDir);
	await mkdir(absDir, { recursive: true });
	for (const record of records) {
		await writeFileAtomic(path.join(absDir, record.filename), record.body);
	}
	return { kind: 'scaffolded', records };
};
