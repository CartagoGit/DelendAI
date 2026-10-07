/**
 * cache-layout.interface.ts
 *
 * Shapes for the cache layout lifecycle: the numbered layout of the
 * persisted cache, the class of every artifact in it, and the migrations
 * that carry a workspace from one layout epoch to the next. Behaviour
 * lives in `lib/cache/cache-layout-migration.helper.ts`.
 *
 * A layout epoch is not a package version and not a store schema version.
 * It changes only when a path or a format that an OLDER build persisted
 * stops being the one the current build reads.
 */
import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from './workspace-migration.interface';

/**
 * What may be done with an artifact when its layout is retired.
 *
 * - `derived`: regenerable from other inputs; deleting it is safe.
 * - `ephemeral`: scratch of a finished run; deleting it is safe.
 * - `operational`: live state (queues, locks, counters); migrate or keep.
 * - `records`: accumulated history the owner plugin retains; never
 *   deleted by the lifecycle, only moved by an owner-specific migration.
 */
export type ICacheArtifactClass =
	| 'derived'
	| 'ephemeral'
	| 'operational'
	| 'records';

export interface ICacheArtifactDescriptor {
	/** Stable name of the artifact, unique within a manifest. */
	readonly id: string;
	/** The plugin or subsystem that owns the artifact's content. */
	readonly owner: string;
	/** Path relative to the resolved cache directory, `/`-separated. */
	readonly path: string;
	readonly class: ICacheArtifactClass;
}

/** Executable documentation of the layout the current build reads. */
export interface ICacheLayoutManifest {
	readonly epoch: number;
	readonly artifacts: readonly ICacheArtifactDescriptor[];
}

export type IMoveIfDestinationMissingOutcome =
	| 'moved'
	| 'kept-source'
	| 'skipped-conflict';

/**
 * The only filesystem operations a layout migration may perform. Each
 * one takes cache-relative paths and refuses to leave the cache
 * directory, so a migration cannot reach the rest of the workspace.
 */
export interface ICacheLayoutHelpers {
	/** Delete something regenerable. Refuses records and operational paths. */
	readonly dropDerived: (relPath: string) => Promise<void>;
	/** Move without ever overwriting: a present destination is a conflict. */
	readonly moveIfDestinationMissing: (
		fromRel: string,
		toRel: string,
	) => Promise<IMoveIfDestinationMissingOutcome>;
	/** Remove a directory only when nothing is left in it. */
	readonly removeEmptyDirectory: (relPath: string) => Promise<void>;
	readonly pathExists: (relPath: string) => Promise<boolean>;
	/** Throws when the path would escape the cache directory. */
	readonly assertContained: (relPath: string) => void;
}

export interface ICacheLayoutMigrationContext extends IMigrationContext {
	/** The resolved, workspace-contained cache directory (absolute). */
	readonly cacheDirAbs: string;
	readonly helpers: ICacheLayoutHelpers;
}

/**
 * One step of the chain `N -> N + 1`. It keeps the identity and the
 * detect/plan/apply shape of `IMigration`, but works on the cache
 * directory through the helpers instead of the bare workspace root.
 */
export interface ICacheLayoutMigration extends Pick<IMigration, 'id'> {
	readonly fromEpoch: number;
	readonly toEpoch: number;
	/** Cheap probe: does the cache carry this step's old layout? No writes. */
	readonly detect: (ctx: ICacheLayoutMigrationContext) => Promise<boolean>;
	/** What `apply` would do. Backs the dry run. */
	readonly plan: (
		ctx: ICacheLayoutMigrationContext,
	) => Promise<readonly IMigrationPlanStep[]>;
	readonly apply: (ctx: ICacheLayoutMigrationContext) => Promise<void>;
}
