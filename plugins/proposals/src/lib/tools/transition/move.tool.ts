// effect-boundary-authorized: the transition's own file effects: moving a proposal document between status folders and removing the duplicate copy a collision leaves, under the document mutex.
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { safeRename, toolOk, withFileMutexes } from '@delendai/core/public';
import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/runtime';
import type { IProposalStatus } from '../../contracts/constants/proposal-glossary.constant';
import { locateProposal, type ILocatedProposal } from '../../proposals/locate';
import {
	readFrontmatterField,
	setFrontmatterStatus,
	setFrontmatterField,
} from '../../proposals/proposal-frontmatter-writer';
import { syncProposalRegistry } from '../../proposals/sync-proposal-registry';
import { createGitRunner, type IGitRunner } from '../../shared/git-runner';
import { rewriteStaleProposalSelfPaths } from '../../proposals/rewrite-stale-self-paths';
import { createIndexFreeGitRunner } from '../../shared/index-free-git-runner';
import {
	alreadyClosedOutcome,
	closedOutcome,
	compareLifecycleAdvancement,
	lifecycleEntity,
} from '../../services/lifecycle-outcome';
import { LAST_TRANSITION_AT_FIELD } from '../../contracts/constants/transition-duration.constant';
import type {
	IProposalTransitionToolOptions,
	IApplyArgs,
	IDestinationCollisionResolution,
} from '../../contracts/interfaces/proposal-transition-tool.interface';
import { resolveTargetFolder } from './dfa.tool';
import {
	LAST_TRANSITION_ID_FIELD,
	LAST_CORRELATION_ID_FIELD,
	LAST_IDEMPOTENCY_KEY_FIELD,
	LAST_TRANSITION_FROM_FIELD,
} from '../../contracts/constants/proposal-transition-schema.constant';
import { setFrontmatterMetadataField } from './idempotency.tool';
import { appendWarning, isTrackedFile } from './delivery-evidence.tool';

/** The same answer, reporting where the document actually is. */
export const withLandedPath = <TResult extends object>(
	result: TResult,
	landed: string,
): TResult => {
	if (!('structuredContent' in result)) return result;
	const structured = result.structuredContent as Record<string, unknown>;
	const entity = structured.entity as Record<string, unknown> | undefined;
	const patched = {
		...structured,
		...(entity === undefined
			? {}
			: { entity: { ...entity, path: landed } }),
		...('movedTo' in structured ? { movedTo: landed } : {}),
	};
	return {
		...result,
		structuredContent: patched,
		content: [{ type: 'text', text: JSON.stringify(patched) }],
	};
};

/** Where a successful transition left the document, relative to the tree. */
export const movedPathOf = (result: object): string | undefined => {
	const structured =
		'structuredContent' in result
			? (result.structuredContent as
					| { readonly entity?: { readonly path?: unknown } }
					| undefined)
			: undefined;
	const path = structured?.entity?.path;
	return typeof path === 'string' && path.length > 0 ? path : undefined;
};

const pathExists = async (abs: string): Promise<boolean> =>
	access(abs).then(
		() => true,
		() => false,
	);

/**
 * Deletes a duplicate copy, preferring `git rm` so the deletion is staged
 * alongside the move that replaces it. Falls back to a plain unlink when
 * git is unavailable or the file is untracked — the invariant we care
 * about ("exactly one file for this id") holds either way.
 */
const removeDuplicateCopy = async (
	gitRunner: IGitRunner,
	abs: string,
): Promise<void> => {
	const result = await gitRunner(['rm', '-f', '--', abs]);
	if (result.ok && !(await pathExists(abs))) return;
	await rm(abs, { force: true });
};

/**
 * x00529 S1 — decide what to do when the transition destination is
 * already occupied.
 *
 * Historically this aborted the whole transition AFTER the source
 * frontmatter had already been rewritten, which is exactly how the repo
 * ended up with 11 ids living in two status folders at once: one copy
 * carrying `shipped-in` / `closed-at`, the other a pre-transition
 * snapshot, and nothing to say which one to believe.
 *
 * The rules:
 *  - destination holds a DIFFERENT id → still a loud failure. Two
 *    distinct proposals colliding on one path is a real bug, never
 *    something to auto-resolve.
 *  - destination holds the SAME id → keep the copy that is further along
 *    the forward lifecycle (ready < in-progress < review < done) and
 *    delete the other, so exactly one file survives.
 *  - either side is parked (`paused` / `blocked` / `retired`) or has an
 *    unreadable status → not comparable, so fail loudly rather than
 *    guess.
 */
const resolveDestinationCollision = async (
	args: {
		readonly id: string;
		readonly to: IProposalStatus;
		readonly sourceAbs: string;
		readonly targetAbs: string;
	},
	proposalsDirAbs: string,
	gitRunner: IGitRunner,
): Promise<IDestinationCollisionResolution> => {
	const targetRel = relative(proposalsDirAbs, args.targetAbs);
	const sourceRel = relative(proposalsDirAbs, args.sourceAbs);
	const targetText = await new SafeWorkspaceReader(proposalsDirAbs)
		.readText(targetRel)
		.then((value) => value.content)
		.catch(() => null);
	if (targetText === null) {
		throw new Error(
			`cannot complete transition for ${args.id}: destination ${targetRel} exists but is unreadable. Resolve it by hand, then retry.`,
		);
	}
	const targetId = readFrontmatterField(targetText, 'id');
	if (targetId !== args.id) {
		throw new Error(
			`cannot complete transition for ${args.id}: destination ${targetRel} is occupied by a DIFFERENT proposal (${targetId ?? 'unknown id'}). Resolve the collision by hand (rename the destination, then retry).`,
		);
	}
	const targetStatus =
		readFrontmatterField(targetText, 'status') ?? undefined;
	const comparison = compareLifecycleAdvancement(args.to, targetStatus);
	if (comparison === null) {
		throw new Error(
			`cannot complete transition for ${args.id}: destination ${targetRel} already holds this id with status "${targetStatus ?? 'unknown'}", which is not comparable with "${args.to}" on the forward lifecycle. Resolve the duplicate by hand, then retry.`,
		);
	}
	if (comparison === 'a') {
		// The incoming copy is strictly further along: the squatter is a
		// stale leftover. Drop it and let the move proceed.
		await removeDuplicateCopy(gitRunner, args.targetAbs);
		return {
			winner: 'incoming',
			removedPath: targetRel,
			keptPath: targetRel,
			existingStatus: targetStatus,
			note: `duplicate resolved: ${args.id} already had a copy at ${targetRel} with status "${targetStatus ?? 'unknown'}"; the incoming "${args.to}" copy is further along, so the stale destination copy was removed.`,
		};
	}
	// Tie or the destination is further along: the destination is the
	// surviving truth. Delete the source snapshot so the id stops
	// existing in two folders.
	await removeDuplicateCopy(gitRunner, args.sourceAbs);
	return {
		winner: 'existing',
		removedPath: sourceRel,
		keptPath: targetRel,
		existingStatus: targetStatus,
		note: `duplicate resolved: ${args.id} already existed at ${targetRel} with status "${targetStatus ?? 'unknown'}" (at or beyond the requested "${args.to}"); the stale copy at ${sourceRel} was removed and the destination kept.`,
	};
};

export const applyTransition = async (
	args: IApplyArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
	depId?: string,
) => {
	const baseRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const gitRunner =
		options.indexFreeMoves === true
			? createIndexFreeGitRunner(baseRunner)
			: baseRunner;
	const newFolder = await resolveTargetFolder(
		args.to,
		found,
		options.proposalsDirAbs,
		options.folderPolicy,
	);
	const filename = found.absPath.split('/').pop() ?? found.absPath;
	const newAbsPath = join(options.proposalsDirAbs, newFolder, filename);
	const moved = newAbsPath !== found.absPath;

	let gitWarning: string | undefined;
	let collisionResolution: IDestinationCollisionResolution | undefined;
	let filesRewritten = 0;
	const movedFromRel = relative(options.proposalsDirAbs, found.absPath);
	const movedToRel = relative(options.proposalsDirAbs, newAbsPath);
	let staleOutcome:
		| {
				content: Array<{ type: 'text'; text: string }>;
				structuredContent: Record<string, unknown>;
				isError?: boolean;
		  }
		| undefined;
	await withFileMutex(found.absPath, async () => {
		const current = await new SafeWorkspaceReader(options.proposalsDirAbs)
			.readText(relative(options.proposalsDirAbs, found.absPath))
			.then((value) => value.content)
			.catch(async (error: unknown) => {
				const relocated = await locateProposal(args.id, {
					indexPathAbs: options.indexPathAbs ?? '',
					proposalsDirAbs: options.proposalsDirAbs,
				});
				if (relocated !== null && relocated.status === args.to) {
					const envelope = {
						ok: true as const,
						...alreadyClosedOutcome({
							entity: lifecycleEntity({
								id: args.id,
								entity: 'proposal',
								status: relocated.status,
								path: relative(
									options.proposalsDirAbs,
									relocated.absPath,
								),
							}),
							reason: 'close retried from a stale read after the proposal had already moved to done',
							currentStatus: relocated.status,
						}),
						id: args.id,
						from: args.from,
						to: args.to,
						reason: args.reason,
						transitionId: args.transitionId,
						correlationId: args.correlationId,
						idempotencyKey: args.idempotencyKey,
						idempotentReplay: false,
						movedTo: relative(
							options.proposalsDirAbs,
							relocated.absPath,
						),
					};
					staleOutcome = {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(envelope),
							},
						],
						structuredContent: envelope,
					};
					return '';
				}
				throw error;
			});
		if (staleOutcome !== undefined) return;
		const currentStatus =
			readFrontmatterField(current, 'status') ?? found.status;
		if (currentStatus !== args.from) {
			if (currentStatus === args.to && args.to === 'done') {
				const envelope = {
					ok: true as const,
					...alreadyClosedOutcome({
						entity: lifecycleEntity({
							id: args.id,
							entity: 'proposal',
							status: currentStatus,
							path: movedFromRel,
						}),
						reason: 'close retried after another actor already closed the proposal',
						currentStatus,
					}),
					id: args.id,
					from: args.from,
					to: args.to,
					reason: args.reason,
					transitionId: args.transitionId,
					correlationId: args.correlationId,
					idempotencyKey: args.idempotencyKey,
					idempotentReplay: false,
					movedTo: movedFromRel,
				};
				staleOutcome = {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(envelope),
						},
					],
					structuredContent: envelope,
				};
				return;
			}
			throw new Error(
				`stale transition read for ${args.id}: expected status ${args.from}, found ${currentStatus}`,
			);
		}
		// Resolve an occupied destination BEFORE touching the
		// source. The old code rewrote the source frontmatter first and
		// only then discovered the collision, which left the advanced
		// snapshot sitting in the OLD folder next to the copy in the new
		// one: two competing truths for one id, and a single such pair
		// freezes `sync_proposals` for the whole repository.
		if (moved && (await pathExists(newAbsPath))) {
			collisionResolution = await resolveDestinationCollision(
				{
					id: args.id,
					to: args.to,
					sourceAbs: found.absPath,
					targetAbs: newAbsPath,
				},
				options.proposalsDirAbs,
				gitRunner,
			);
			if (collisionResolution.winner === 'existing') {
				// The destination copy is the surviving truth; the source
				// snapshot is gone. Report the transition as already
				// applied rather than rewriting the destination.
				const envelope = {
					ok: true as const,
					...alreadyClosedOutcome({
						entity: lifecycleEntity({
							id: args.id,
							entity: 'proposal',
							status:
								collisionResolution.existingStatus ?? args.to,
							path: movedToRel,
						}),
						reason: collisionResolution.note,
						currentStatus:
							collisionResolution.existingStatus ?? args.to,
					}),
					id: args.id,
					from: args.from,
					to: args.to,
					reason: args.reason,
					transitionId: args.transitionId,
					correlationId: args.correlationId,
					idempotencyKey: args.idempotencyKey,
					idempotentReplay: false,
					duplicateResolved: collisionResolution.note,
					movedTo: movedToRel,
				};
				staleOutcome = {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(envelope),
						},
					],
					structuredContent: envelope,
				};
				return;
			}
		}
		let updated = setFrontmatterStatus(current, args.to);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_TRANSITION_ID_FIELD,
			args.transitionId,
		);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_CORRELATION_ID_FIELD,
			args.correlationId,
		);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_TRANSITION_FROM_FIELD,
			args.from,
		);
		if (args.idempotencyKey !== undefined) {
			updated = setFrontmatterMetadataField(
				updated,
				LAST_IDEMPOTENCY_KEY_FIELD,
				args.idempotencyKey,
			);
		}
		if (args.to === 'blocked' && depId) {
			updated = setFrontmatterField(updated, 'blocked-by', `[${depId}]`);
		}
		// Rewrite stale self-paths in `**Files**` / `files:` so
		// slice plans do not keep pointing at the pre-transition location
		// (e.g. ready/… after a move to done/feats/…).
		if (moved) {
			// `**Files**` entries are resolved against the REPO ROOT — every
			// other entry in these lists is repo-root-relative
			// (`packages/core/src/…`). Rewriting a self-path to the
			// proposals-dir-relative form (`review/f00293-x.md`) therefore
			// produced a path the very next gate could not resolve: the
			// transition broke the document it had just moved, and the
			// following `→ done` failed with `missing-declared-files`.
			//
			// Both spellings are normalised to the repo-root form; the
			// helper's lookbehind keeps the short pass from matching inside
			// an already-rewritten long path.
			const movedFromRepoRel = relative(
				options.workspaceRoot,
				found.absPath,
			);
			const movedToRepoRel = relative(options.workspaceRoot, newAbsPath);
			const longPass = rewriteStaleProposalSelfPaths(updated, {
				oldRelPath: movedFromRepoRel,
				newRelPath: movedToRepoRel,
			});
			const shortPass = rewriteStaleProposalSelfPaths(longPass.markdown, {
				oldRelPath: movedFromRel,
				newRelPath: movedToRepoRel,
			});
			updated = shortPass.markdown;
			filesRewritten = longPass.replacements + shortPass.replacements;
		}
		updated = setFrontmatterMetadataField(
			updated,
			LAST_TRANSITION_AT_FIELD,
			new Date((options.now ?? Date.now)()).toISOString(),
		);
		await writeFileAtomic(found.absPath, updated);

		if (moved) {
			// S1 — the source frontmatter has already been rewritten
			// at this point. If anything in the move fails we must NOT
			// leave an advanced snapshot behind in the old folder: restore
			// the pre-transition content so the tree keeps exactly one
			// coherent copy and the operation is cleanly retryable. This
			// is the state the 2026-09-08 audit kept finding — an
			// `status: done` file still sitting in `ready/`.
			const rollbackSourceOnFailure = async (
				error: unknown,
			): Promise<never> => {
				await writeFileAtomic(found.absPath, current).catch(() => {
					/* best effort: the original error is the one to report */
				});
				throw error;
			};
			try {
				// Keep dynamically-created status/kind folders visible to git too.
				const targetDir = dirname(newAbsPath);
				await mkdir(targetDir, { recursive: true });
				const gitkeep = join(targetDir, '.gitkeep');
				if (
					!(await access(gitkeep).then(
						() => true,
						() => false,
					))
				) {
					await writeFileAtomic(gitkeep, '');
				}
				if (!(await isTrackedFile(gitRunner, found.absPath))) {
					await withFileMutexes([found.absPath, newAbsPath], () =>
						safeRename(found.absPath, newAbsPath),
					);
					await gitRunner(['add', newAbsPath]);
				} else {
					const result = await gitRunner([
						'mv',
						found.absPath,
						newAbsPath,
					]);
					if (!result.ok) {
						// Best-effort: git mv failing (no git, dirty tree) must
						// not strand the frontmatter mid-update. `safeRename`
						// preserves blame history via the bare rename but
						// refuses to clobber an existing destination — the
						// failure surfaces as a typed `SafeRenameTargetExistsError`
						// that the outer `try/catch` translates to a `toolError`.
						//
						// / B1 race fix: lock BOTH source and
						// destination so two concurrent transitions into
						// the same destination folder cannot race through
						// `safeRename`'s check-then-act.
						try {
							await withFileMutexes(
								[found.absPath, newAbsPath],
								() => safeRename(found.absPath, newAbsPath),
							);
							gitWarning = `git mv failed (${result.reason ?? 'unknown'}); fell back to a plain rename — blame history for this file was not preserved by git.`;
						} catch (collision) {
							throw new Error(
								`cannot complete transition: target already exists at ${newAbsPath} and git mv was unavailable to merge (${result.reason ?? 'unknown'}). Resolve the collision by hand (rename the destination, then retry).`,
								{ cause: collision },
							);
						}
					}
				}
			} catch (moveFailure) {
				await rollbackSourceOnFailure(moveFailure);
			}
		}
	});
	if (staleOutcome !== undefined) return staleOutcome;

	// S3: regenerate the proposals index so continue_proposal /
	// locate no longer resolve the pre-move path. Best-effort — a sync
	// failure must not roll back a successful file move; surface it as a
	// warning instead.
	let indexSynced = false;
	if (options.indexPathAbs !== undefined) {
		try {
			const layout = {
				proposalsDir: relative(
					options.workspaceRoot,
					options.proposalsDirAbs,
				),
				proposalIndexFile: relative(
					options.workspaceRoot,
					options.indexPathAbs,
				),
			};
			await syncProposalRegistry(
				options.workspaceRoot,
				layout,
				[],
				gitRunner,
				options.folderPolicy,
			);
			indexSynced = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gitWarning = appendWarning(
				gitWarning,
				`index sync failed after transition (${msg}); run sync_proposals`,
			);
		}
	}

	return toolOk({
		...closedOutcome({
			entity: lifecycleEntity({
				id: args.id,
				entity: 'proposal',
				status: args.to,
				path: movedToRel,
			}),
			from: args.from,
			to: args.to,
		}),
		id: args.id,
		from: args.from,
		to: args.to,
		reason: args.reason,
		transitionId: args.transitionId,
		correlationId: args.correlationId,
		idempotencyKey: args.idempotencyKey,
		idempotentReplay: false,
		movedFrom: movedFromRel,
		movedTo: movedToRel,
		indexSynced,
		filesRewritten,
		// S1: when the destination was occupied by a stale copy of
		// the SAME id, say so in the envelope — the resolution is a real
		// repair of a two-truths state, not a silent overwrite.
		...(collisionResolution !== undefined
			? { duplicateResolved: collisionResolution.note }
			: {}),
		...(gitWarning ? { warning: gitWarning } : {}),
	});
};
