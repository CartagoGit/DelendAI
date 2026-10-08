import {
	CACHE_LAYOUT_EPOCH,
	CACHE_LAYOUT_MANIFEST,
	CACHE_LAYOUT_UNRECORDED_EPOCH,
} from '../contracts/constants/cache-layout.constant';
import type {
	ICacheLayoutMigration,
	ICacheLayoutMigrationContext,
	ICacheLayoutPlannedStep,
	ICacheLayoutRunInput,
	ICacheLayoutRunResult,
} from '../contracts/interfaces/cache-layout.interface';
import { createCacheLayoutHelpers } from './cache-layout-helpers.service';
import { resolveMigrationChain } from './cache-layout-migration.helper';

/**
 * Epochs already confirmed current in this process, per workspace, so the
 * check happens once per boot and not once per entrypoint.
 */
const confirmedCurrent = new Map<string, number>();

/** Forget what this process confirmed. For tests. */
export const resetCacheLayoutEpochMemo = (): void => {
	confirmedCurrent.clear();
};

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Walk the chain once. A step with nothing to do is skipped, the same way
 * the identity engine skips a migrator that plans nothing; a step that
 * does something is applied unless this is a rehearsal.
 */
const walkChain = async (
	chain: readonly ICacheLayoutMigration[],
	ctx: ICacheLayoutMigrationContext,
): Promise<
	| { readonly ok: true; readonly done: readonly ICacheLayoutPlannedStep[] }
	| { readonly ok: false; readonly id: string; readonly reason: string }
> => {
	const done: ICacheLayoutPlannedStep[] = [];
	for (const migration of chain) {
		try {
			if (!(await migration.detect(ctx))) continue;
			const steps = await migration.plan(ctx);
			if (steps.length === 0) continue;
			if (!ctx.dryRun) await migration.apply(ctx);
			done.push({
				id: migration.id,
				fromEpoch: migration.fromEpoch,
				toEpoch: migration.toEpoch,
				steps,
			});
		} catch (error) {
			return {
				ok: false,
				id: migration.id,
				reason: describeError(error),
			};
		}
	}
	return { ok: true, done };
};

const carry = async (
	input: ICacheLayoutRunInput,
	target: number,
	appliedEpoch: number | null,
): Promise<ICacheLayoutRunResult> => {
	const fromEpoch = appliedEpoch ?? CACHE_LAYOUT_UNRECORDED_EPOCH;
	const dryRun = input.dryRun === true;
	let chain: readonly ICacheLayoutMigration[];
	try {
		chain = resolveMigrationChain(input.migrations, fromEpoch, target);
	} catch (error) {
		return {
			status: 'failed',
			id: 'cache-layout',
			reason: describeError(error),
		};
	}
	let ctx: ICacheLayoutMigrationContext;
	try {
		const cacheDirAbs = await input.resolveCacheDirAbs();
		ctx = {
			workspaceRoot: input.workspaceRoot,
			dryRun,
			cacheDirAbs,
			helpers: createCacheLayoutHelpers({
				cacheDirAbs,
				manifest: CACHE_LAYOUT_MANIFEST,
				dryRun,
			}),
		};
	} catch (error) {
		return {
			status: 'failed',
			id: 'cache-layout',
			reason: describeError(error),
		};
	}
	const walked = await walkChain(chain, ctx);
	if (!walked.ok)
		return { status: 'failed', id: walked.id, reason: walked.reason };
	if (dryRun)
		return {
			status: 'planned',
			fromEpoch,
			toEpoch: target,
			pending: walked.done,
		};
	// Last, and only after the whole chain: a crash anywhere above leaves
	// the epoch where it was, and the next boot repeats an idempotent walk.
	await input.store.setAppliedEpoch('cache-layout', target);
	confirmedCurrent.set(input.workspaceRoot, target);
	return {
		status: 'migrated',
		fromEpoch,
		toEpoch: target,
		applied: walked.done,
	};
};

/**
 * Carry a workspace's cache from the epoch it recorded to this build's.
 *
 * When the recorded epoch already matches, this reads it once and does
 * nothing else: no directory is listed, no path is checked, nothing is
 * written, and the answer is remembered for the rest of the process.
 */
export const runPendingCacheLayoutMigrations = async (
	input: ICacheLayoutRunInput,
): Promise<ICacheLayoutRunResult> => {
	const target = input.targetEpoch ?? CACHE_LAYOUT_EPOCH;
	if (input.migrations.length === 0) return { status: 'unregistered' };
	if (confirmedCurrent.get(input.workspaceRoot) === target)
		return { status: 'current' };
	const applied = await input.store.getAppliedEpoch('cache-layout');
	if (applied === target) {
		confirmedCurrent.set(input.workspaceRoot, target);
		return { status: 'current' };
	}
	// A rehearsal takes no lock: it changes nothing a second process could
	// trip over.
	if (input.dryRun === true) return carry(input, target, applied);
	return input.store.withMigrationLock(async () => {
		// Read again inside the lock: a process that waited here finds the
		// epoch the first one recorded and leaves.
		const current = await input.store.getAppliedEpoch('cache-layout');
		if (current === target) {
			confirmedCurrent.set(input.workspaceRoot, target);
			return { status: 'current' } as const;
		}
		return carry(input, target, current);
	});
};
