/**
 * proposal-transition.tool.ts
 *
 * `<prefix>_proposal_transition`: move a proposal to a new status,
 * validated against the DFA (f00016 §4.2) and with the folder
 * (f00016 §4.1) and frontmatter `status` kept in sync via one atomic
 * operation (`withFileMutex` + `writeFileAtomic` + `git mv`).
 *
 * Post-SOLID-refactor:
 *   - The tool file is now pure orchestration. All disk I/O and
 *     parsing go through injected helpers:
 *       • `locateProposal` → shared helper in `proposals/locate.ts`
 *         (DRY; the previous inline copy is gone).
 *       • `setFrontmatterStatus` → `proposals/proposal-frontmatter-writer.ts`
 *         (pure byte-level mutation, unit-testable in isolation).
 *       • `isPlanProposal` → `proposals/proposal-type-detector.ts`
 *         (single source of truth for "is this a plan?").
 *       • `runPlanClosureGuard` → `swarm/plan-closure-guard.ts`
 *         (the q00001 closure composition; the inline 12-line block
 *         is gone).
 *   - The tool no longer reaches into low-level modules. It composes
 *     abstractions (DIP) and only knows about the DFA, the
 *     frontmatter-writer, and the guard.
 *
 * Legacy handling:
 *   Only operates on proposals whose CURRENT frontmatter status is
 *   already one of the new 7 (`IProposalStatus`). The 14 legacy files
 *   still use the old 8-status union and are untouched until
 *   S11/S12 migrate them. A legacy file's status simply won't be
 *   found in `PROPOSAL_STATUS_TRANSITIONS`, so the tool refuses
 *   cleanly without needing a feature flag.
 */

import { mkdir, readFile, rename } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalStatus } from '../contracts/constants/proposal-glossary.constant';
import { locateProposal } from '../proposals/locate';
import type { ILocatedProposal } from '../proposals/locate';
import { setFrontmatterStatus } from '../proposals/proposal-frontmatter-writer';
import { isPlanProposal } from '../proposals/proposal-type-detector';
import { runPlanClosureGuard } from '../swarm/plan-closure-guard';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';

export interface IProposalTransitionToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path to `docs/mcp-vertex/proposals/` (the 7 status folders live here). */
	readonly proposalsDirAbs: string;
	readonly workspaceRoot: string;
	/**
	 * f00016 + q00001: absolute path to `<cacheDir>/proposals/index.json`
	 * (the regenerable registry index — see x00052 for the move from
	 * `docs/mcp-vertex/proposals/index.json`). Used by the q00001
	 * plan-closure guard to look up child proposal statuses when the
	 * caller transitions a `type: plan` proposal to `done`. Optional —
	 * when absent, the plan-closure guard is skipped (legacy hosts
	 * that have not yet adopted the index file keep working).
	 */
	readonly indexPathAbs?: string;
	/** Injectable for tests; defaults to a real `git mv` in `workspaceRoot`. */
	readonly gitRunner?: IGitRunner;
}

export interface IProposalTransitionArgs {
	readonly id: string;
	readonly to: string;
	readonly reason: string;
}

const isKnownStatus = (value: string): value is IProposalStatus =>
	value in PROPOSAL_STATUSES;

const TOOL_ERROR_SCHEMA = z.object({
	reason: z.string(),
	nextAction: z.string().optional(),
});

const PROPOSAL_TRANSITION_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: TOOL_ERROR_SCHEMA.optional(),
	id: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	reason: z.string().optional(),
	movedFrom: z.string().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
});

export const runProposalTransition = async (
	args: IProposalTransitionArgs,
	options: IProposalTransitionToolOptions,
) => {
	const rejection = validateTransitionArgs(args);
	if (rejection !== null) return rejection;
	// After `validateTransitionArgs` succeeded, `args.to` is one of
	// the 7 known statuses. The `as IProposalStatus` cast is the
	// explicit narrow — TypeScript cannot infer the type narrowing
	// across the early-return boundary, so we re-state it.
	const to: IProposalStatus = isKnownStatus(args.to)
		? args.to
		: (args.to as IProposalStatus);

	const found = await locateProposal(args.id, {
		indexPathAbs: options.indexPathAbs ?? '',
		proposalsDirAbs: options.proposalsDirAbs,
	});
	if (found === null) {
		return toolError(
			`no proposal with id "${args.id}" found under ${options.proposalsDirAbs}`,
			'Check the id, or run sync_proposals first.',
		);
	}

	const from = validateCurrentStatus(args.id, found);
	if (typeof from !== 'string') return from;

	const dfaRejection = validateTransition(args.id, from, to);
	if (dfaRejection !== null) return dfaRejection;

	const guardRejection = await maybeApplyPlanClosureGuard(
		args,
		found,
		options,
	);
	if (guardRejection !== null) return guardRejection;

	return await applyTransition(
		{ id: args.id, from, to, reason: args.reason },
		found,
		options,
	);
};

// ---------------------------------------------------------------------------
// Step 1 — Validate args (cheap, no I/O).
// ---------------------------------------------------------------------------

const validateTransitionArgs = (
	args: IProposalTransitionArgs,
): ReturnType<typeof toolError> | null => {
	if (args.reason.trim() === '') {
		return toolError(
			'reason is required',
			'Call proposal_transition with a non-empty reason (audit trail).',
		);
	}
	if (!isKnownStatus(args.to)) {
		return toolError(
			`"${args.to}" is not one of the 7 known statuses`,
			`Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		);
	}
	return null;
};

// ---------------------------------------------------------------------------
// Step 2 — Reject legacy / off-state-machine proposals.
// Returns the narrowed status on success, or a toolError on failure.
// ---------------------------------------------------------------------------

const validateCurrentStatus = (
	id: string,
	found: ILocatedProposal,
): IProposalStatus | ReturnType<typeof toolError> => {
	if (isKnownStatus(found.status)) return found.status;
	return toolError(
		`"${id}" has current status "${found.status}", which is not on the new state machine yet`,
		'This proposal predates f00016 (legacy 8-status union) — it is migrated by S11/S12, not transitioned by this tool.',
	);
};

// ---------------------------------------------------------------------------
// Step 3 — Validate the DFA edge (status → status transition allowed?).
// ---------------------------------------------------------------------------

const validateTransition = (
	_id: string,
	from: IProposalStatus,
	to: IProposalStatus,
): ReturnType<typeof toolError> | null => {
	const legalTargets = PROPOSAL_STATUS_TRANSITIONS[from];
	if (legalTargets.has(to)) return null;
	return toolError(
		`illegal transition: "${from}" → "${to}"`,
		legalTargets.size > 0
			? `From "${from}", the only legal targets are: ${[...legalTargets].join(', ')}.`
			: `"${from}" is terminal — no transitions out.`,
	);
};

// ---------------------------------------------------------------------------
// Step 4 — q00001 closure guard (only fires for `type: plan` → done).
// ---------------------------------------------------------------------------

const maybeApplyPlanClosureGuard = async (
	args: IProposalTransitionArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
): Promise<ReturnType<typeof toolError> | null> => {
	if (args.to !== 'done') return null;
	if (options.indexPathAbs === undefined) return null;

	// `locateProposal` returns a partial record when only the index
	// matched (no re-read of the file). The plan-closure guard needs
	// the full markdown, so we re-read it here. Cheap and keeps the
	// locate helper single-responsibility.
	const raw = await readFile(found.absPath, 'utf8');
	if (!isPlanProposal(raw)) return null;

	const guard = await runPlanClosureGuard({
		planId: args.id,
		planAbsPath: found.absPath,
		proposalsDirAbs: options.proposalsDirAbs,
		indexPathAbs: options.indexPathAbs,
	});
	if (guard.closable) return null;
	return toolError(
		`plan ${args.id} is not closable: ${guard.blockerCount} blocker(s)`,
		`Resolve the blockers first, then call proposal_transition again.\n${guard.blockerLines.join('\n')}\n\nTip: use proposals_close_plan for a friendlier wrapper that runs this same guard.`,
	);
};

// ---------------------------------------------------------------------------
// Step 5 — Apply the transition (file mutation + git mv).
// ---------------------------------------------------------------------------

interface IApplyArgs {
	readonly id: string;
	readonly from: IProposalStatus;
	readonly to: IProposalStatus;
	readonly reason: string;
}

const applyTransition = async (
	args: IApplyArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
) => {
	const gitRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const newFolder = STATUS_TO_FOLDER[args.to];
	const filename = found.absPath.split('/').pop() ?? found.absPath;
	const newAbsPath = join(options.proposalsDirAbs, newFolder, filename);
	const moved = newAbsPath !== found.absPath;

	let gitWarning: string | undefined;
	await withFileMutex(found.absPath, async () => {
		const current = await readFile(found.absPath, 'utf8');
		const updated = setFrontmatterStatus(current, args.to);
		await writeFileAtomic(found.absPath, updated);

		if (moved) {
			// The 7 status folders are expected to already exist (this repo
			// seeds them with .gitkeep), but a host project adopting f00016
			// fresh, or a stray custom folder, might not have created the
			// target yet — never fail the transition over a missing dir.
			await mkdir(dirname(newAbsPath), { recursive: true });
			const result = await gitRunner(['mv', found.absPath, newAbsPath]);
			if (!result.ok) {
				// Best-effort: git mv failing (no git, file untracked, dirty
				// tree) must not strand the frontmatter mid-update. A plain
				// rename still gets the folder/status pair consistent; blame
				// preservation is lost, surfaced as a warning, not an error.
				await rename(found.absPath, newAbsPath);
				gitWarning = `git mv failed (${result.reason ?? 'unknown'}); fell back to a plain rename — blame history for this file was not preserved by git.`;
			}
		}
	});

	return toolOk({
		id: args.id,
		from: args.from,
		to: args.to,
		reason: args.reason,
		movedFrom: relative(options.proposalsDirAbs, found.absPath),
		movedTo: relative(options.proposalsDirAbs, newAbsPath),
		...(gitWarning ? { warning: gitWarning } : {}),
	});
};

// ---------------------------------------------------------------------------
// Tool registration.
// ---------------------------------------------------------------------------

/** Registration for `<prefix>_proposal_transition`. */
export const buildProposalTransitionRegistration = (
	options: IProposalTransitionToolOptions,
): IToolRegistration => ({
	id: 'proposal_transition',
	effects: ['write'],
	summary:
		'Move a proposal to a new status; validated, folder+frontmatter kept in sync.',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_transition`,
			{
				outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
				description:
					'Move a proposal to a new status. Validates against the DFA, updates frontmatter + git mv. Requires reason.',
				inputSchema: z.object({
					id: z.string().min(1),
					to: z.string().min(1),
					reason: z.string().min(1),
				}),
			},
			async (args: IProposalTransitionArgs) =>
				runProposalTransition(args, options),
		);
	},
});
