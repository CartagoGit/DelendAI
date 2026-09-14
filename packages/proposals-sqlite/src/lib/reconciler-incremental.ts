/**
 * reconciler-incremental.ts — apply the files a change touched directly
 * to the active database.
 *
 * ## Why this is not the shadow path
 *
 * `reconcileShadowToStaging` rebuilds a whole projection from a commit
 * into a throwaway copy, which is then validated and promoted. That is
 * the right shape for authority: it can compare digests, classify
 * disappearances and refuse a promotion wholesale.
 *
 * It is the wrong shape for a single file. Repairing one quarantined
 * proposal, or picking up one edited slice, does not justify rebuilding
 * every row in the repository — and the projection it would rebuild is
 * mostly identical to what is already there.
 *
 * ## What it must never do
 *
 * Plans and slices are NOT overwritten when they already exist. Their
 * status is lifecycle state — claimed, in progress, closed — governed by
 * transitions and evidence, not by whatever the markdown currently says.
 * An incremental pass that stamped the file's status over a slice
 * somebody had already claimed would undo real work with a parse.
 * Proposals may be updated because their projection IS the file; even
 * then it goes through the repository's own compare, which reports
 * `unchanged` when the content hash matches.
 *
 * ## Idempotence
 *
 * Running the same pass twice must change nothing the second time and
 * must not duplicate lifecycle events or outbox entries. That falls out
 * of the repositories rather than being re-implemented here: the
 * proposal upsert returns `unchanged` on an equal content hash, and the
 * outbox rows it enqueues carry an idempotency key derived from the
 * revision. `unchanged` is reported separately from `updated` so a
 * second pass can PROVE it, instead of being believed.
 */

import { ProposalsSqliteDriver } from './sqlite-driver';
import { reconcileProposalMarkdown } from './reconciler-markdown';
import { ProposalRepo } from './repository/proposals-repo';
import { PlanRepo } from './repository/plans-repo';
import { SliceRepo } from './repository/slices-repo';
import { QuarantineRepo } from './repository/quarantine-repo';

import type {
	IIncrementalReconcileInput,
	IIncrementalReconcileResult,
} from './reconciler-incremental.interface';

export type {
	IIncrementalReconcileInput,
	IIncrementalReconcileResult,
} from './reconciler-incremental.interface';

export const RECONCILER_INCREMENTAL_VERSION = 'r00055-s1';

export const reconcileIncremental = (
	input: IIncrementalReconcileInput,
): IIncrementalReconcileResult => {
	const now = input.now ?? Date.now();
	const driver = new ProposalsSqliteDriver({ path: input.databasePath });
	try {
		const handle = driver.handle;
		const parsed = reconcileProposalMarkdown({
			sourceCommit: input.sourceCommit,
			mode: 'incremental',
			files: input.files,
		});

		const run = handle
			.prepare(
				`INSERT INTO reconciliation_runs (
					source_commit, source_tree, reconciler_version,
					schema_version, started_at, completed_at, status,
					files_seen, files_changed, entities_created,
					entities_updated, entities_deleted, entities_quarantined,
					logical_digest, kind, error
				) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, 'incremental', NULL)`,
			)
			.run(
				input.sourceCommit,
				RECONCILER_INCREMENTAL_VERSION,
				driver.schemaVersion,
				now,
				now,
				parsed.quarantined.length > 0 ? 'degraded' : 'ok',
				input.files.length,
				input.files.length,
				parsed.quarantined.length,
			);
		const runId = Number(run.lastInsertRowid);

		const proposalRepo = new ProposalRepo(handle);
		const planRepo = new PlanRepo(handle);
		const sliceRepo = new SliceRepo(handle);
		const quarantineRepo = new QuarantineRepo(handle);

		let proposalsCreated = 0;
		let proposalsUpdated = 0;
		let proposalsUnchanged = 0;
		for (const candidate of parsed.proposals) {
			const outcome = proposalRepo.upsertProjection(candidate, now);
			if (outcome.kind === 'created') proposalsCreated += 1;
			else if (outcome.kind === 'unchanged') proposalsUnchanged += 1;
			else proposalsUpdated += 1;
		}

		// Create what is missing; never restate what exists. A plan or
		// slice already in the database carries lifecycle state the file
		// does not know about.
		let plansCreated = 0;
		for (const plan of parsed.plans) {
			if (planRepo.getByUid(plan.uid) !== null) continue;
			const parent = proposalRepo.getByUid(plan.proposalUid);
			if (parent === null) continue;
			planRepo.create({
				uid: plan.uid,
				proposalId: parent.id,
				slug: plan.slug,
				title: plan.title,
				sourcePath: plan.path,
				status: plan.status,
				now,
			});
			plansCreated += 1;
		}

		let slicesCreated = 0;
		for (const slice of parsed.slices) {
			if (sliceRepo.getByUid(slice.uid) !== null) continue;
			const parent = planRepo.getByUid(slice.planUid);
			if (parent === null) continue;
			sliceRepo.create({
				uid: slice.uid,
				planId: parent.id,
				slug: slice.slug,
				title: slice.title,
				sourcePath: slice.path,
				status: slice.status,
				now,
			});
			slicesCreated += 1;
		}

		// The candidate carries the path and the failure; the blob sha
		// comes from the file that produced it, which the caller already
		// has. Reconstructing it from the candidate would be a second
		// source of truth for the same fact.
		const shaByPath = new Map(
			input.files.map((file) => [file.path, file.sha] as const),
		);
		for (const entry of parsed.quarantined) {
			quarantineRepo.record({
				sourcePath: entry.path,
				blobSha: shaByPath.get(entry.path) ?? '',
				errorCode: entry.errorCode,
				errorMessage: entry.errorMessage,
				entityGuess: null,
				rawMetadata: null,
				runId,
				now,
			});
		}

		return {
			status: parsed.quarantined.length > 0 ? 'degraded' : 'ok',
			runId,
			proposalsCreated,
			proposalsUpdated,
			proposalsUnchanged,
			plansCreated,
			slicesCreated,
			quarantined: parsed.quarantined.length,
		};
	} finally {
		driver.close();
	}
};
