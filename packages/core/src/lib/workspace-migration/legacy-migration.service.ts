/**
 * legacy-migration.service.ts — b00239 S2.
 *
 * The versioned, idempotent engine that lets a workspace built against an
 * older identity heal itself.
 *
 * ## Why this is the product, not a rebranding chore
 *
 * A rename that makes every existing project hunt down stale references by
 * hand is the exact work this project exists to remove. The measure of the
 * DelendAI rebrand is not that the repository says DelendAI; it is that a
 * project which today launches the old binary comes back working after one
 * run, and its owner only notices that nothing broke.
 *
 * ## Two properties the engine has to have
 *
 * **Cheap when there is nothing to do.** Every project-aware entrypoint
 * asks this before loading the server, so the common case — a workspace
 * with no legacy identity at all — must cost a probe and produce no
 * output. A migration check that announces itself on every start is a
 * migration check that gets disabled.
 *
 * **Idempotent, by recording what ran.** Re-running a completed migration
 * must change nothing, and the way to guarantee that is to record
 * completion rather than to re-derive it from the tree. Deriving it means
 * asking "does this look migrated?", and a half-finished tree can look
 * migrated from one angle and not another.
 *
 * The registry is ordered and each entry declares the id it produces, so
 * `applied` is a set of migration ids and never a version number: a number
 * cannot express "this project skipped v1 because it started at v2".
 */

/** A migration's stable identity. Recorded, so completion is a fact. */
export type IMigrationId = string;

export interface IMigrationContext {
	readonly workspaceRoot: string;
	/** True for a rehearsal: detect and plan, change nothing. */
	readonly dryRun: boolean;
}

export interface IMigrationPlanStep {
	readonly kind: string;
	readonly detail: string;
}

export interface IMigration {
	readonly id: IMigrationId;
	/**
	 * Cheap probe: does this workspace carry the old identity at all?
	 *
	 * Must be fast and must not write. It runs before every server start,
	 * so anything expensive here is a tax on every project that has
	 * nothing to migrate — which, after the transition, is all of them.
	 */
	readonly detect: (ctx: IMigrationContext) => Promise<boolean>;
	/** What `apply` would do. Used by `--dry-run` and by the manifest. */
	readonly plan: (
		ctx: IMigrationContext,
	) => Promise<readonly IMigrationPlanStep[]>;
	readonly apply: (ctx: IMigrationContext) => Promise<void>;
}

export interface IMigrationJournal {
	/** Migration ids already applied to this workspace. */
	readonly read: (workspaceRoot: string) => Promise<readonly IMigrationId[]>;
	readonly record: (workspaceRoot: string, id: IMigrationId) => Promise<void>;
}

export type IMigrationOutcome =
	| { readonly status: 'not-needed' }
	| {
			readonly status: 'planned';
			readonly id: IMigrationId;
			readonly steps: readonly IMigrationPlanStep[];
	  }
	| { readonly status: 'migrated'; readonly id: IMigrationId }
	| {
			readonly status: 'failed';
			readonly id: IMigrationId;
			readonly reason: string;
	  };

export interface IMigrationRunResult {
	readonly outcomes: readonly IMigrationOutcome[];
	/** True when at least one migration ran or would run. */
	readonly acted: boolean;
}

/**
 * Run every pending migration, in registry order.
 *
 * Ordering is by declaration and not by id, because migrations may depend
 * on each other's output and an alphabetical accident is not a dependency
 * statement.
 */
export const runPendingMigrations = async (input: {
	readonly migrations: readonly IMigration[];
	readonly journal: IMigrationJournal;
	readonly ctx: IMigrationContext;
}): Promise<IMigrationRunResult> => {
	const applied = new Set(await input.journal.read(input.ctx.workspaceRoot));
	const outcomes: IMigrationOutcome[] = [];

	for (const migration of input.migrations) {
		if (applied.has(migration.id)) continue;

		// Detect BEFORE plan: the whole point of the cheap probe is that a
		// workspace with nothing to migrate never reaches the expensive
		// half.
		if (!(await migration.detect(input.ctx))) continue;

		if (input.ctx.dryRun) {
			outcomes.push({
				status: 'planned',
				id: migration.id,
				steps: await migration.plan(input.ctx),
			});
			continue;
		}

		try {
			await migration.apply(input.ctx);
		} catch (error) {
			// A failure is reported and STOPS the run. Continuing would
			// apply a later migration on top of a workspace whose earlier
			// step did not finish, which is how a half-migrated tree gets
			// recorded as complete.
			outcomes.push({
				status: 'failed',
				id: migration.id,
				reason: String(error),
			});
			return { outcomes, acted: true };
		}

		// Recorded only after `apply` returns. Recording first would mark a
		// crashed migration as done and make the damage permanent.
		await input.journal.record(input.ctx.workspaceRoot, migration.id);
		outcomes.push({ status: 'migrated', id: migration.id });
	}

	if (outcomes.length === 0)
		return { outcomes: [{ status: 'not-needed' }], acted: false };
	return { outcomes, acted: true };
};

/**
 * The guard every project-aware entrypoint calls before loading plugins.
 *
 * Returns quietly when there is nothing to do — no logging, no
 * side effects — because it runs on every start of every project forever,
 * and a check that talks on the happy path is a check somebody turns off.
 */
export const ensureWorkspaceMigrated = async (input: {
	readonly migrations: readonly IMigration[];
	readonly journal: IMigrationJournal;
	readonly workspaceRoot: string;
	/** Called only when something actually happened. */
	readonly report?: (result: IMigrationRunResult) => void;
}): Promise<IMigrationRunResult> => {
	const result = await runPendingMigrations({
		migrations: input.migrations,
		journal: input.journal,
		ctx: { workspaceRoot: input.workspaceRoot, dryRun: false },
	});
	if (result.acted) input.report?.(result);
	return result;
};
