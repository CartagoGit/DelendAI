/**
 * workspace-migration.interface.ts — b00239 S2.
 *
 * Shapes for the engine that lets a workspace built against an older
 * product identity heal itself. Behaviour lives in
 * `lib/workspace-migration/legacy-migration.service.ts`.
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
 * How a residual hit is classified when the scanner finds one after a
 * migration.
 *
 * `live` is the only category that must reach zero. The others exist
 * because "zero occurrences of the old name" is the wrong target: a
 * sentence like "mcp-vertex 0.1.x wrote its cache here" is TRUE, and
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
