/**
 * workspace-migration.interface.ts — b00239 S2.
 *
 * Shapes for the engine that lets a workspace built against an older
 * product identity heal itself. Behaviour lives in
 * `lib/workspace-migration/legacy-migration.service.ts`.
 */

/** A migration's stable identity. Recorded, so completion is a fact. */
import type { IConfigTransitionRunResult } from './config-transition.interface';

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
	 * Whether this migration is a STANDING CHECK rather than a one-shot
	 * rename.
	 *
	 * A rename is done when it is done: `mcp-vertex` becomes `delendai`,
	 * and the fact that it happened is a fact forever. The journal records
	 * it and the engine never asks again.
	 *
	 * A standing check answers a question about the workspace's CURRENT
	 * state: "does this config still agree with the policy the same file
	 * declares?". Both halves of that question are editable at any
	 * moment — the config is a file a person edits, and the profile it
	 * declares can change — so the answer can change after the migration
	 * ran. Such a migration is asked on every boot, and its id in the
	 * journal means nothing.
	 *
	 * The difference is not cosmetic. A rename that does not re-run
	 * leaves an old string in a file. A standing check that does not
	 * re-run leaves a SETTING THE BOOT REFUSES OVER: the server exits on
	 * every start, the host restarts it in a loop, and the error names a
	 * remedy the tool is supposed to apply and cannot.
	 */
	readonly convergent?: boolean;
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
	| {
			readonly status: 'migrated';
			readonly id: IMigrationId;
			/** What it did, as its plan said before it applied. */
			readonly steps?: readonly IMigrationPlanStep[];
	  }
	| {
			readonly status: 'failed';
			readonly id: IMigrationId;
			readonly reason: string;
	  };

export interface IMigrationRunResult {
	readonly outcomes: readonly IMigrationOutcome[];
	/** True when at least one migration ran or would run. */
	readonly acted: boolean;
	/**
	 * What changed because the configuration changed since it was last
	 * applied. Absent when transitions were not run (for instance, a
	 * migration failed first).
	 */
	readonly transitions?: IConfigTransitionRunResult | undefined;
}

/**
 * How a residual hit is classified when the scanner finds one after a
 * migration.
 *
 * `live` is the only category that must reach zero. The others exist
 * because "zero occurrences of the old name" is the wrong target: a
 * sentence like "delendai 0.1.x wrote its cache here" is TRUE, and
 * rewriting it would falsify the record to make a counter look tidy.
 */
export type IResidualClass = 'live' | 'historical' | 'vendored' | 'generated';

export interface IResidualHit {
	readonly file: string;
	readonly line: number;
	readonly spelling: string;
	readonly text: string;
	readonly classification: IResidualClass;
	/** Why it was classified this way, so a human can disagree. */
	readonly reason: string;
}
