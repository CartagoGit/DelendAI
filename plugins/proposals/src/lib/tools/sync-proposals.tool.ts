// effect-boundary-authorized: access() probes whether a proposal file is
// present before syncing it; the sync itself goes through the normal write
// path.

import { access } from 'node:fs/promises';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';

import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import type { IProposalFolderPolicy } from '../contracts/proposal-folder-policy';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';

export interface ISyncProposalsToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root the engine resolves proposal paths under. */
	readonly workspaceRoot: string;
	/**
	 * Workspace-relative layout for the proposals dir + index file.
	 * Defaults to `DEFAULT_PATH_LAYOUT` inside the engine when omitted.
	 */
	readonly layout?: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	/**
	 * Host-specific proposal subfolders (relative to proposalsDir) to scan
	 * beyond the generic ones, e.g. `['paused/demos']`.
	 */
	readonly extraFolders?: readonly string[];
	readonly folderPolicy?: IProposalFolderPolicy;
	/** Injectable for tests; defaults to a real `git` in `workspaceRoot`. */
	readonly gitRunner?: IGitRunner;
}

export interface ISyncProposalsPayload {
	readonly changed: boolean;
	readonly count: number;
	readonly indexPath: string;
	readonly errors: readonly string[];
}

const exists = async (abs: string): Promise<boolean> =>
	access(abs).then(
		() => true,
		() => false,
	);

/**
 * x00529 S3 — keep ONE bad file from freezing the whole repository.
 *
 * The reconciliation pass inside `syncProposalRegistry` moves any file
 * whose folder disagrees with its frontmatter status. That move refuses
 * to clobber an occupied destination — correctly, since clobbering
 * would destroy a proposal — but it refuses by THROWING, before the
 * index is regenerated. On 2026-09-08 that meant a single stale
 * `ready/feats/f00284-...md` sitting next to its `done/feats/` twin
 * aborted `sync_proposals` for all ~888 proposals: the index went
 * stale repo-wide and every agent's `locate` answered from a frozen
 * snapshot, all because of one file nobody could see.
 *
 * The blast radius, not the refusal, was the bug. This wrapper
 * intercepts exactly the collision case — a move whose destination
 * already exists — and turns it into a SKIPPED move plus a diagnostic,
 * so the sweep runs to completion, the index is regenerated from
 * everything else, and the duplicate is reported in `errors[]` where
 * the uniqueness lint (S2) and a human can act on it.
 *
 * Nothing is ever overwritten and no file is deleted: the guard only
 * declines to perform a move that would have thrown anyway. Every other
 * git invocation is passed straight through, so a `git mv` that fails
 * for an ordinary reason (dirty tree, no git) still takes the engine's
 * normal `safeRename` fallback.
 */
export const createCollisionTolerantGitRunner = (
	inner: IGitRunner,
	onCollision: (message: string) => void,
): IGitRunner => {
	return async (args) => {
		if (args[0] !== 'mv' || args.length < 3) return inner(args);
		const from = args[args.length - 2];
		const to = args[args.length - 1];
		if (from === undefined || to === undefined) return inner(args);
		if (!(await exists(to)) || !(await exists(from))) return inner(args);
		onCollision(
			`duplicate proposal on disk: refusing to move ${from} onto the existing ${to}. Both files claim the same slot; the index was rebuilt from the rest of the tree. Resolve with \`bun tools/scripts/lint/proposal-uniqueness.script.ts\`, keep the copy furthest along ready < in-progress < review < done, delete the other, then re-run sync_proposals.`,
		);
		// Report success WITHOUT moving: the engine then skips its
		// `safeRename` fallback (which is what used to throw) and
		// carries on reconciling and indexing the rest of the tree.
		return { ok: true, output: '' };
	};
};

/**
 * Runs the sync engine, degrading on a duplicate rather than aborting.
 *
 * Exported so the spec can drive it without an MCP server.
 */
export const runSyncProposals = async (
	options: ISyncProposalsToolOptions,
): Promise<ISyncProposalsPayload> => {
	const collisions: string[] = [];
	const gitRunner = createCollisionTolerantGitRunner(
		options.gitRunner ?? createGitRunner(options.workspaceRoot),
		(message) => {
			if (!collisions.includes(message)) collisions.push(message);
		},
	);
	const result = await syncProposalRegistry(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? [],
		gitRunner,
		options.folderPolicy,
	);
	// The engine's own duplicate/drift warnings come first; the
	// collisions this wrapper absorbed are appended so nothing it
	// swallowed disappears from the report.
	const errors = [
		...result.errors,
		...collisions.filter((message) => !result.errors.includes(message)),
	];
	return {
		changed: result.changed,
		// `count` is the number of entities actually indexed — with a
		// duplicate present that is still every readable proposal, which
		// is the point of degrading instead of throwing.
		count: result.count,
		indexPath: result.indexPath,
		errors,
	};
};

/**
 * Post-mutation hook: regenerates the proposal index from the markdown
 * files under the proposals dir. Idempotent; reports whether the index
 * changed. Call after creating or renaming files under the proposals
 * dir. Thin adapter over the (tested) sync engine.
 */
export const buildSyncProposalsRegistration = (
	options: ISyncProposalsToolOptions,
): IToolRegistration => ({
	id: 'sync_proposals',
	effects: ['write'],
	summary:
		'Rebuild the proposal index from the .md files (run after creating/renaming proposals).',
	tags: ['lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_sync_proposals`,
			{
				inputSchema: z.object({}),
				outputSchema: z.object({
					changed: z.boolean(),
					count: z.number(),
					indexPath: z.string(),
					errors: z.array(z.string()),
				}),
				description:
					'Regenerate the proposal index from the .md files under the proposals dir. Idempotent. Invoke after any create or rename under the proposals dir. Returns { changed, count, indexPath, errors }. A duplicate proposal id degrades to an entry in errors[] instead of aborting the sweep.',
			},
			async () => {
				const result = await runSyncProposals(options);
				const payload = {
					changed: result.changed,
					count: result.count,
					indexPath: result.indexPath,
					errors: [...result.errors],
				};
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(payload),
						},
					],
					structuredContent: payload,
				};
			},
		);
	},
});
